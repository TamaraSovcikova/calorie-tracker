/**
 * Fitbit data access via the Google Health API.
 *
 * Why Google: Fitbit shut down new app registrations on their legacy Web
 * API in May 2026 ahead of the September 2026 sunset. The replacement is
 * the Google Health API, which exposes Fitbit / Pixel Watch data through a
 * unified data-point model.
 *
 * Auth: Google OAuth 2.0 Authorization Code with PKCE. Google "Web
 * application" clients are confidential clients, so the token exchange
 * also needs the client secret (kept in the browser — acceptable for a
 * personal single-user app). Refresh tokens issued while the OAuth client
 * is in "Testing" mode expire after ~7 days; the UI surfaces a reconnect
 * prompt.
 *
 * Token storage: src/db/repos/fitbitTokens (Dexie + Cloudflare Worker
 * sync) so connecting on one device works on every device.
 */

import {
  deleteFitbitTokens,
  getFitbitTokens,
  putFitbitTokens,
} from '@/db/repos/fitbitTokens';
import type { LocalDate } from '@/lib/dates';

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Relative path — health.googleapis.com sends no CORS headers, so calls go
// through a same-origin proxy (Vite dev server in dev, Worker in prod).
const API_BASE = '/gh-api/v4';

const CLIENT_ID_LS = 'calorie-tracker:google-client-id';
const CLIENT_SECRET_LS = 'calorie-tracker:google-client-secret';
const LEGACY_CLIENT_ID_LS = 'calorie-tracker:fitbit-client-id';
const PKCE_LS = 'calorie-tracker:fitbit-pkce';
const ACCOUNT_EMAIL_LS = 'calorie-tracker:google-account-email';
const REDIRECT_PATH = '/auth/fitbit/callback';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
].join(' ');

// ---------- Credential storage ----------

export function getFitbitClientId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  // One-time migration from the pre-Google-Health key name.
  const legacy = localStorage.getItem(LEGACY_CLIENT_ID_LS);
  if (legacy && !localStorage.getItem(CLIENT_ID_LS)) {
    localStorage.setItem(CLIENT_ID_LS, legacy);
    localStorage.removeItem(LEGACY_CLIENT_ID_LS);
  }
  return (
    localStorage.getItem(CLIENT_ID_LS) ||
    import.meta.env.VITE_FITBIT_CLIENT_ID ||
    null
  );
}

export function setFitbitClientId(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!id || !id.trim()) localStorage.removeItem(CLIENT_ID_LS);
  else localStorage.setItem(CLIENT_ID_LS, id.trim());
}

export function getGoogleClientSecret(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return (
    localStorage.getItem(CLIENT_SECRET_LS) ||
    import.meta.env.VITE_GOOGLE_CLIENT_SECRET ||
    null
  );
}

export function setGoogleClientSecret(secret: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!secret || !secret.trim()) localStorage.removeItem(CLIENT_SECRET_LS);
  else localStorage.setItem(CLIENT_SECRET_LS, secret.trim());
}

const LOGIN_HINT_LS = 'calorie-tracker:google-login-hint';

/**
 * Optional preferred Google account email. Passed to the auth flow as
 * `login_hint` so a multi-account phone doesn't default to the wrong
 * Google account (e.g. a work account with no Fitbit / API access).
 */
export function getGoogleLoginHint(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LOGIN_HINT_LS);
}

export function setGoogleLoginHint(email: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!email || !email.trim()) localStorage.removeItem(LOGIN_HINT_LS);
  else localStorage.setItem(LOGIN_HINT_LS, email.trim());
}

/** Email of the connected Google account, if known. */
export function getConnectedAccountEmail(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ACCOUNT_EMAIL_LS);
}

/** Decode the email claim from an OpenID id_token JWT (no signature check —
 *  it came straight from Google over TLS in our own PKCE exchange). */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

// ---------- PKCE ----------

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length = 64): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer).slice(0, length);
}

async function sha256(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
}

interface PkceState {
  verifier: string;
  state: string;
  redirectUri: string;
  createdAt: number;
}

const PKCE_TTL_MS = 10 * 60 * 1000;

function getRedirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`;
}

// localStorage rather than sessionStorage — Chrome cross-site storage rules
// can wipe sessionStorage across an OAuth redirect chain. The createdAt TTL
// limits replay risk.
function storePkce(state: PkceState): void {
  localStorage.setItem(PKCE_LS, JSON.stringify(state));
}

function readPkce(): PkceState | null {
  const raw = localStorage.getItem(PKCE_LS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PkceState;
    if (typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > PKCE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPkce(): void {
  localStorage.removeItem(PKCE_LS);
}

/**
 * Build the Google authorize URL. access_type=offline + prompt=consent are
 * required for Google to issue a refresh_token.
 *
 * Account selection: if the user has set their Google email (login_hint),
 * we send them STRAIGHT to that account (`prompt=consent` only). Pairing
 * `login_hint` with `prompt=select_account` is what caused the bug Tamara
 * hit - select_account forces the chooser, which on a phone defaults to the
 * primary (often Workspace-restricted) account and the hint is ignored. With
 * no hint we keep `select_account` so the user at least gets the chooser
 * instead of being silently signed into the wrong account.
 */
export async function beginFitbitAuth(): Promise<string> {
  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Google OAuth Client ID not configured');

  const verifier = randomString(64);
  const state = randomString(32);
  const redirectUri = getRedirectUri();
  const challenge = base64UrlEncode(await sha256(verifier));

  storePkce({ verifier, state, redirectUri, createdAt: Date.now() });

  const hint = getGoogleLoginHint();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    redirect_uri: redirectUri,
    access_type: 'offline',
    // With a known account, go directly to it; otherwise force the chooser.
    prompt: hint ? 'consent' : 'select_account consent',
    include_granted_scopes: 'true',
  });
  if (hint) params.set('login_hint', hint);
  return `${AUTH_BASE}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function completeFitbitAuth(
  searchParams: URLSearchParams,
): Promise<void> {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  if (errorParam) throw new Error(`Google returned error: ${errorParam}`);
  if (!code || !state) throw new Error('Missing code or state in callback URL');

  const pkce = readPkce();
  if (!pkce) {
    throw new Error('PKCE verifier missing or expired — start the flow again');
  }
  clearPkce();
  if (state !== pkce.state) throw new Error('OAuth state mismatch');

  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Google OAuth Client ID not configured');

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: pkce.verifier,
    redirect_uri: pkce.redirectUri,
  });
  const clientSecret = getGoogleClientSecret();
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Token exchange failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as GoogleTokenResponse;
  if (!data.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke the app at https://myaccount.google.com/permissions and try again.',
    );
  }
  const email = emailFromIdToken(data.id_token);
  if (email) localStorage.setItem(ACCOUNT_EMAIL_LS, email);

  await putFitbitTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
    fitbit_user_id: email ?? undefined,
  });
}

// ---------- Token refresh ----------

async function refreshTokens(): Promise<void> {
  const tokens = await getFitbitTokens();
  if (!tokens) throw new Error('Not connected to Fitbit');
  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Google OAuth Client ID not configured');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId,
  });
  const clientSecret = getGoogleClientSecret();
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    // 400/401 means the refresh token expired or was revoked (testing-mode
    // tokens last ~7 days) — wipe locally so the UI shows a reconnect prompt.
    if (res.status === 400 || res.status === 401) await deleteFitbitTokens();
    throw new Error(`Google refresh failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as GoogleTokenResponse;
  await putFitbitTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
    fitbit_user_id: tokens.fitbit_user_id,
  });
}

async function ensureValidAccessToken(): Promise<string> {
  let tokens = await getFitbitTokens();
  if (!tokens) throw new Error('Not connected to Fitbit');
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() >= expiresAt - 60_000) {
    await refreshTokens();
    tokens = await getFitbitTokens();
    if (!tokens) throw new Error('Fitbit reconnect required');
  }
  return tokens.access_token;
}

// ---------- Daily activity rollup ----------

export interface FitbitDailySummary {
  date: LocalDate;
  /** Raw total from Google Health = resting (BMR) + all activity. The
   *  diary converts this to activity-only via features/fitbit/
   *  activityCalories before storing. */
  totalCaloriesBurned: number;
  /** Device-reported active energy (already excludes resting burn and folds
   *  in logged workouts). 0 when the connected source does not provide it.
   *  Fitbit's total-calories is largely a passive estimate, so a logged
   *  workout shows up here rather than in the total - this is what makes
   *  workout calories appear in the diary. */
  activeEnergyBurned: number;
  steps?: number;
}

interface CivilDateTime {
  date: { year: number; month: number; day: number };
  time: { hours: number; minutes: number; seconds: number; nanos: number };
}

interface RollupDataPoint {
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  // Plus one data-type-specific object, e.g. steps: { steps_sum: 8500 } or
  // totalCalories: { total_calories_sum: 2300 }. Names vary per data type,
  // so extractRollupValue scans instead of hard-coding them.
  [key: string]: unknown;
}

interface DailyRollupResponse {
  rollupDataPoints?: RollupDataPoint[];
  nextPageToken?: string;
}

/** Build a CivilDateTime for the given local date — start or end of day. */
function civilDateTime(date: LocalDate, endOfDay: boolean): CivilDateTime {
  const [year, month, day] = date.split('-').map(Number);
  return {
    date: { year, month, day },
    time: endOfDay
      ? { hours: 23, minutes: 59, seconds: 59, nanos: 0 }
      : { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

/** Coerce a number or numeric string to a finite number, else null.
 *  Google returns int64 fields (e.g. steps countSum) as JSON strings. */
function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** First numeric leaf inside a rollup point (skipping the date fields). */
function extractRollupValue(point: RollupDataPoint): number {
  for (const [key, val] of Object.entries(point)) {
    if (key === 'civilStartTime' || key === 'civilEndTime') continue;
    const direct = coerceNumber(val);
    if (direct !== null) return direct;
    if (val && typeof val === 'object') {
      for (const inner of Object.values(val as Record<string, unknown>)) {
        const n = coerceNumber(inner);
        if (n !== null) return n;
      }
    }
  }
  return 0;
}

interface RollupResult {
  value: number;
  raw: unknown;
  status: number;
}

/**
 * Query the dailyRollUp endpoint for one local date.
 *   POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp
 *   body: { range: { start: CivilDateTime, end: CivilDateTime }, windowSizeDays }
 * start = 00:00:00 and end = 23:59:59 of the SAME date, windowSizeDays 1.
 */
async function fetchDailyRollup(
  token: string,
  dataType: string,
  date: LocalDate,
): Promise<RollupResult> {
  const body = {
    range: {
      start: civilDateTime(date, false),
      end: civilDateTime(date, true),
    },
    windowSizeDays: 1,
    pageSize: 10,
  };
  const url = `${API_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('GOOGLE_AUTH');
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _unparsed: text };
  }
  if (!res.ok) {
    throw new Error(
      `Google Health ${dataType} HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  const data = parsed as DailyRollupResponse;
  const points = data.rollupDataPoints ?? [];
  const value = points.reduce((s, p) => s + extractRollupValue(p), 0);
  return { value, raw: parsed, status: res.status };
}

export async function getDailySummary(
  date: LocalDate,
): Promise<FitbitDailySummary> {
  let token = await ensureValidAccessToken();

  const zero = { value: 0, raw: null, status: 0 };
  const run = async (): Promise<FitbitDailySummary> => {
    const calories = await fetchDailyRollup(token, 'total-calories', date);
    // active-energy-burned isn't provided by every source; tolerate absence.
    const active = await fetchDailyRollup(
      token,
      'active-energy-burned',
      date,
    ).catch(() => zero);
    const steps = await fetchDailyRollup(token, 'steps', date).catch(() => zero);
    return {
      date,
      totalCaloriesBurned: Math.round(calories.value),
      activeEnergyBurned: Math.round(active.value),
      steps: steps.value > 0 ? Math.round(steps.value) : undefined,
    };
  };

  try {
    return await run();
  } catch (err) {
    if ((err as Error).message === 'GOOGLE_AUTH') {
      await refreshTokens();
      token = await ensureValidAccessToken();
      return run();
    }
    throw err;
  }
}

/**
 * Diagnostic used by Settings — returns the raw HTTP outcome for both data
 * types so a "0 kcal" can be told apart: empty 200 = no migrated data yet,
 * 4xx = a request problem.
 */
export interface FitbitDebugResult {
  date: LocalDate;
  account: string | null;
  /** One line per probed data type, so a workout day shows which stream
   *  actually carries the burn. */
  probes: { type: string; result: string }[];
}

/** Data types worth probing when activity calories look wrong. The first two
 *  drive the diary; the rest help identify where a logged workout landed. */
const DEBUG_DATA_TYPES = [
  'total-calories',
  'active-energy-burned',
  'active-zone-minutes',
  'active-minutes',
  'exercise',
  'steps',
];

export async function debugGoogleHealth(
  date: LocalDate,
): Promise<FitbitDebugResult> {
  const token = await ensureValidAccessToken();
  const probe = async (dataType: string): Promise<string> => {
    try {
      const r = await fetchDailyRollup(token, dataType, date);
      return `HTTP ${r.status} · value=${r.value} · ${JSON.stringify(r.raw).slice(0, 300)}`;
    } catch (e) {
      return e instanceof Error ? e.message : 'error';
    }
  };
  const probes: { type: string; result: string }[] = [];
  for (const t of DEBUG_DATA_TYPES) {
    probes.push({ type: t, result: await probe(t) });
  }
  return { date, account: getConnectedAccountEmail(), probes };
}

export async function disconnectFitbit(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(ACCOUNT_EMAIL_LS);
  }
  await deleteFitbitTokens();
}

export { REDIRECT_PATH as FITBIT_REDIRECT_PATH };
