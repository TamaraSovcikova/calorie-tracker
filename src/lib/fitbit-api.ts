/**
 * Fitbit data access via the Google Health API.
 *
 * Why Google: Fitbit shut down new app registrations on their legacy Web
 * API in May 2026 ahead of the September 2026 sunset. The replacement is
 * Google Health API, which exposes Fitbit/Pixel Watch data through a
 * unified data-point model.
 *
 * Auth model: Google OAuth 2.0 Authorization Code with PKCE — no client
 * secret in the browser. Refresh tokens issued in "Testing" mode (which
 * personal-use apps stay in indefinitely without going through Google'\''s
 * full verification process) expire after ~7 days. The UI surfaces that
 * with a "Reconnect Fitbit" prompt; one-tap to re-authorise.
 *
 * Token storage: src/db/repos/fitbitTokens (Dexie + Cloudflare Worker
 * sync). Connect once on the laptop, available everywhere.
 */

import {
  deleteFitbitTokens,
  getFitbitTokens,
  putFitbitTokens,
} from '@/db/repos/fitbitTokens';
import type { LocalDate } from '@/lib/dates';

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://health.googleapis.com/v4';

const CLIENT_ID_LS = 'calorie-tracker:google-client-id';
const LEGACY_CLIENT_ID_LS = 'calorie-tracker:fitbit-client-id'; // migrate from
const PKCE_LS = 'calorie-tracker:fitbit-pkce';
const REDIRECT_PATH = '/auth/fitbit/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
].join(' ');

// ---------- Client ID storage ----------

export function getFitbitClientId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  // One-time migration: if a value lived under the old fitbit-client-id
  // key (from the pre-Google-Health attempt), promote it to the new key.
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

// ---------- PKCE helpers ----------

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

function storePkce(state: PkceState): void {
  // localStorage rather than sessionStorage — Chrome's tightened cross-site
  // storage rules can wipe sessionStorage across an OAuth redirect chain.
  // localStorage survives, and we mitigate replay risk with the createdAt
  // TTL check below.
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
 * Build the Google authorize URL and stash the verifier + state in
 * localStorage for the callback to pick up.
 *
 * `access_type=offline` + `prompt=consent` are critical — without them
 * Google won'\''t issue a refresh_token at all, and we'\''d be locked into
 * the 1-hour access-token expiry with no way to renew silently.
 */
export async function beginFitbitAuth(): Promise<string> {
  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Google OAuth Client ID not configured');

  const verifier = randomString(64);
  const state = randomString(32);
  const redirectUri = getRedirectUri();

  const challenge = base64UrlEncode(await sha256(verifier));

  storePkce({ verifier, state, redirectUri, createdAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    redirect_uri: redirectUri,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
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

export async function completeFitbitAuth(searchParams: URLSearchParams): Promise<void> {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  if (errorParam) {
    throw new Error(`Google returned error: ${errorParam}`);
  }
  if (!code || !state) throw new Error('Missing code or state in callback URL');

  const pkce = readPkce();
  if (!pkce) throw new Error('PKCE verifier missing or expired — start the flow again');
  clearPkce();

  if (state !== pkce.state) throw new Error('OAuth state mismatch — possible CSRF');

  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Google OAuth Client ID not configured');

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: pkce.verifier,
    redirect_uri: pkce.redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as GoogleTokenResponse;
  if (!data.refresh_token) {
    // Almost certainly because the user has already granted consent and
    // Google withheld the refresh token. Easiest fix: ask them to revoke
    // and reconnect. Surfaces in the callback page error message.
    throw new Error(
      'Google did not return a refresh token. Revoke the app at https://myaccount.google.com/permissions and try again.',
    );
  }
  await putFitbitTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
    fitbit_user_id: undefined,
  });
}

// ---------- Refresh ----------

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
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    // 400 is the usual "refresh token expired / revoked" response.
    // Testing-mode tokens expire after 7 days — wipe locally so the UI
    // surfaces a Reconnect button.
    if (res.status === 400 || res.status === 401) {
      await deleteFitbitTokens();
    }
    throw new Error(`Google refresh failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as GoogleTokenResponse;
  // Google refresh responses don'\''t always include a new refresh_token;
  // re-use the existing one in that case.
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

// ---------- Daily activity summary ----------

export interface FitbitDailySummary {
  date: LocalDate;
  caloriesOut: number;
  caloriesBMR: number;
  activityCalories: number;
  steps?: number;
}

interface GoogleDataPoint {
  value?: { quantity?: { quantity?: number } };
  // Google'\''s actual schema is verbose. We accept the various shapes that
  // dailyRollup can return.
  quantity?: number;
  startTime?: string;
  endTime?: string;
}

interface GoogleDailyRollupResponse {
  dataPoints?: GoogleDataPoint[];
  nextPageToken?: string;
}

/**
 * Build the [start, end) ISO range for a local YYYY-MM-DD date.
 * Google Health API uses UTC timestamps; for our purposes we treat the
 * date as the local day boundary which is what the user sees in the
 * diary. A small timezone discrepancy at midnight is acceptable.
 */
function dayRangeIso(date: LocalDate): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function extractQuantity(p: GoogleDataPoint): number {
  if (typeof p.quantity === 'number') return p.quantity;
  if (typeof p.value?.quantity?.quantity === 'number') return p.value.quantity.quantity;
  return 0;
}

async function fetchDailyTotal(
  token: string,
  dataType: string,
  date: LocalDate,
): Promise<number> {
  const range = dayRangeIso(date);
  // dailyRollup endpoint: returns one summed point per day inside the range.
  // Filter syntax per Google Health API docs: `startTime >= "..." AND endTime <= "..."`.
  const url = `${API_BASE}/users/me/dataTypes/${dataType}:dailyRollup`;
  const body = {
    filter: `startTime >= "${range.start}" AND endTime <= "${range.end}"`,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    // Should be caught at caller level via refresh; if it still happens,
    // surface as auth issue.
    throw new Error('GOOGLE_AUTH');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Health ${dataType} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as GoogleDailyRollupResponse;
  const points = data.dataPoints ?? [];
  return points.reduce((sum, p) => sum + extractQuantity(p), 0);
}

export async function getDailySummary(date: LocalDate): Promise<FitbitDailySummary> {
  let token = await ensureValidAccessToken();
  try {
    const [totalCalories, steps] = await Promise.all([
      fetchDailyTotal(token, 'total-calories', date).catch((e) => {
        if ((e as Error).message === 'GOOGLE_AUTH') throw e;
        return 0;
      }),
      fetchDailyTotal(token, 'steps', date).catch((e) => {
        if ((e as Error).message === 'GOOGLE_AUTH') throw e;
        return 0;
      }),
    ]);
    // Google Health doesn't separately expose BMR; we approximate by
    // reporting the full total as "caloriesOut" and the activity portion
    // as "active calories" via a different data type in a future pass.
    // For now, treat all returned calories as activity calories since
    // Fitbit'\''s number is conceptually total-day-burn, of which BMR is the
    // chunk you'd be burning anyway. Most calorie trackers show the full
    // total — feels familiar.
    return {
      date,
      caloriesOut: Math.round(totalCalories),
      caloriesBMR: 0,
      activityCalories: Math.round(totalCalories),
      steps: steps > 0 ? Math.round(steps) : undefined,
    };
  } catch (err) {
    if ((err as Error).message === 'GOOGLE_AUTH') {
      // Try one refresh + retry.
      await refreshTokens();
      token = await ensureValidAccessToken();
      const totalCalories = await fetchDailyTotal(token, 'total-calories', date);
      return {
        date,
        caloriesOut: Math.round(totalCalories),
        caloriesBMR: 0,
        activityCalories: Math.round(totalCalories),
      };
    }
    throw err;
  }
}

export async function disconnectFitbit(): Promise<void> {
  await deleteFitbitTokens();
}

export { REDIRECT_PATH as FITBIT_REDIRECT_PATH };
