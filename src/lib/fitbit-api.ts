/**
 * Fitbit Web API client — OAuth 2.0 PKCE flow + daily activity summary.
 *
 * We use the "Client" application type on dev.fitbit.com — public client,
 * PKCE only, no secret in the browser. Activity scope is sufficient for
 * the daily caloriesOut/caloriesBMR fields the diary needs.
 *
 * Token storage: src/db/repos/fitbitTokens (Dexie + Cloudflare Worker
 * sync). Connecting on one device makes Fitbit data available on every
 * device automatically.
 */

import {
  deleteFitbitTokens,
  getFitbitTokens,
  putFitbitTokens,
} from '@/db/repos/fitbitTokens';
import type { LocalDate } from '@/lib/dates';

const AUTH_BASE = 'https://www.fitbit.com/oauth2/authorize';
const TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const API_BASE = 'https://api.fitbit.com';

const CLIENT_ID_LS = 'calorie-tracker:fitbit-client-id';
const PKCE_LS = 'calorie-tracker:fitbit-pkce';
const REDIRECT_PATH = '/auth/fitbit/callback';

// Activity is the only scope we need for caloriesOut. heartrate is requested
// too in case we expand later; profile gives us the user name for the UI.
const SCOPES = ['activity', 'heartrate', 'profile'].join(' ');

// ---------- Client ID storage (entered by user in Settings) ----------

export function getFitbitClientId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(CLIENT_ID_LS) || import.meta.env.VITE_FITBIT_CLIENT_ID || null;
}

export function setFitbitClientId(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (!id || !id.trim()) localStorage.removeItem(CLIENT_ID_LS);
  else localStorage.setItem(CLIENT_ID_LS, id.trim());
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
}

function getRedirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`;
}

/**
 * Build the authorize URL and stash the verifier + state in sessionStorage
 * for the callback to pick up. Caller should `window.location.assign(url)`.
 */
export async function beginFitbitAuth(): Promise<string> {
  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Fitbit Client ID not configured');

  const verifier = randomString(64);
  const state = randomString(32);
  const redirectUri = getRedirectUri();

  const challenge = base64UrlEncode(await sha256(verifier));

  sessionStorage.setItem(
    PKCE_LS,
    JSON.stringify({ verifier, state, redirectUri } satisfies PkceState),
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    redirect_uri: redirectUri,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

interface FitbitTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  user_id?: string;
}

/**
 * Handle the OAuth callback. Reads ?code&state from the current URL,
 * exchanges for tokens, persists them. Throws on any validation error
 * (caller catches and renders a message).
 */
export async function completeFitbitAuth(searchParams: URLSearchParams): Promise<void> {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  if (errorParam) {
    throw new Error(`Fitbit returned error: ${errorParam}`);
  }
  if (!code || !state) throw new Error('Missing code or state in callback URL');

  const raw = sessionStorage.getItem(PKCE_LS);
  if (!raw) throw new Error('PKCE verifier missing — start the flow again');
  const pkce = JSON.parse(raw) as PkceState;
  sessionStorage.removeItem(PKCE_LS);

  if (state !== pkce.state) throw new Error('OAuth state mismatch — possible CSRF');

  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Fitbit Client ID not configured');

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
  const data = (await res.json()) as FitbitTokenResponse;
  await putFitbitTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
    fitbit_user_id: data.user_id,
  });
}

// ---------- Refresh ----------

async function refreshTokens(): Promise<void> {
  const tokens = await getFitbitTokens();
  if (!tokens) throw new Error('Not connected to Fitbit');
  const clientId = getFitbitClientId();
  if (!clientId) throw new Error('Fitbit Client ID not configured');

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
    // 401 usually means the refresh token was revoked — wipe locally so the
    // UI prompts the user to reconnect.
    if (res.status === 400 || res.status === 401) {
      await deleteFitbitTokens();
    }
    throw new Error(`Fitbit refresh failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as FitbitTokenResponse;
  await putFitbitTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    scope: data.scope,
    fitbit_user_id: data.user_id ?? tokens.fitbit_user_id,
  });
}

async function ensureValidAccessToken(): Promise<string> {
  let tokens = await getFitbitTokens();
  if (!tokens) throw new Error('Not connected to Fitbit');

  // Refresh if within 60s of expiry.
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() >= expiresAt - 60_000) {
    await refreshTokens();
    tokens = await getFitbitTokens();
    if (!tokens) throw new Error('Fitbit reconnect required');
  }
  return tokens.access_token;
}

// ---------- API calls ----------

export interface FitbitDailySummary {
  date: LocalDate;
  caloriesOut: number;
  caloriesBMR: number;
  activityCalories: number; // caloriesOut - caloriesBMR
  steps?: number;
}

interface FitbitActivitiesResponse {
  summary?: {
    caloriesOut?: number;
    caloriesBMR?: number;
    activityCalories?: number;
    steps?: number;
  };
}

export async function getDailySummary(date: LocalDate): Promise<FitbitDailySummary> {
  const token = await ensureValidAccessToken();
  const res = await fetch(`${API_BASE}/1/user/-/activities/date/${date}.json`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    // One retry after a forced refresh — covers the rare case where the
    // server-side token TTL ended ahead of our local expiry.
    await refreshTokens();
    return getDailySummary(date);
  }
  if (!res.ok) {
    throw new Error(`Fitbit API HTTP ${res.status}`);
  }
  const data = (await res.json()) as FitbitActivitiesResponse;
  const caloriesOut = data.summary?.caloriesOut ?? 0;
  const caloriesBMR = data.summary?.caloriesBMR ?? 0;
  const activityCalories = Math.max(
    0,
    data.summary?.activityCalories ?? caloriesOut - caloriesBMR,
  );
  return {
    date,
    caloriesOut,
    caloriesBMR,
    activityCalories,
    steps: data.summary?.steps,
  };
}

export async function disconnectFitbit(): Promise<void> {
  // We could POST to /oauth2/revoke but for a personal app just wiping
  // locally is enough — the access token expires in 8h and refresh tokens
  // are single-use anyway.
  await deleteFitbitTokens();
}

export { REDIRECT_PATH as FITBIT_REDIRECT_PATH };
