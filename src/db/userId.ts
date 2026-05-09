/**
 * The "current user id" for local storage.
 *
 * In Phase 11 (Supabase auth) this returns the authenticated user's id.
 * Until then everything is keyed under 'local' so tests + dev work.
 *
 * On sign-up we'll bulk-rewrite all 'local' rows to the new auth uid in
 * a single Dexie transaction.
 */
export const LOCAL_USER_ID = 'local';

export function currentUserId(): string {
  return LOCAL_USER_ID;
}
