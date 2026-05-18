/**
 * The "current user id" — the key every local row is stored under.
 *
 * Each person has a private **sync code**; their account id is a SHA-256
 * hash of that code (the Worker derives the exact same id from the bearer
 * token, so client and server always agree on who owns a row).
 *
 * Before a code is configured everything is keyed under 'local'. On the
 * first connect the 'local' rows are migrated to the derived id — see
 * `sync/userMigration.ts`.
 */
export const LOCAL_USER_ID = 'local';

const USER_ID_KEY = 'calorie-tracker:user-id';

let cached: string | null = null;

export function currentUserId(): string {
  if (cached) return cached;
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(USER_ID_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  }
  return LOCAL_USER_ID;
}

export function setCurrentUserId(id: string): void {
  cached = id;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(USER_ID_KEY, id);
  }
}

/**
 * Derive the account id from a sync code: SHA-256, hex, truncated to 32
 * chars. MUST stay byte-identical to the Worker's `deriveUserId` (see
 * `worker/index.ts`) or a device's rows would be invisible to the server.
 */
export async function deriveUserId(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
