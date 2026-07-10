/**
 * One-time per-user data migration.
 *
 * Until a sync code is connected every row is keyed under 'local'. When a
 * device first connects a code we derive the account id and re-key all of
 * that device's 'local' rows to it, so the (user-scoped) Worker can see
 * them. This runs once; afterwards `currentUserId()` is the derived id and
 * every new row is written under it directly.
 */

import { db } from '../dexie';
import { currentUserId, deriveUserId, setCurrentUserId } from '../userId';
import { getSyncConfig, setCursors } from './config';

/**
 * Rewrite every row owned by `from` to `to`, in a single transaction.
 *
 *  - profiles / pet / fitbit_tokens - user_id IS the primary key, so
 *    re-key with delete + put.
 *  - foods / meals / diary_entries / exercise_entries - user_id is an
 *    indexed field, primary key is `id`: modify in place.
 *  - weight_log - the id embeds the user id (`w:{user}:{date}`), so each
 *    row is re-keyed individually.
 *  - meal_items - no user_id (keyed by meal_id); nothing to do.
 */
export async function rewriteUserId(from: string, to: string): Promise<void> {
  if (from === to) return;
  await db.transaction(
    'rw',
    [
      db.profiles,
      db.foods,
      db.meals,
      db.diary_entries,
      db.exercise_entries,
      db.weight_log,
      db.fitbit_tokens,
      db.pet,
    ],
    async () => {
      // user_id IS the primary key here - re-key with delete + put.
      const profile = await db.profiles.get(from);
      if (profile) {
        await db.profiles.delete(from);
        await db.profiles.put({ ...profile, user_id: to });
      }
      const tokens = await db.fitbit_tokens.get(from);
      if (tokens) {
        await db.fitbit_tokens.delete(from);
        await db.fitbit_tokens.put({ ...tokens, user_id: to });
      }
      const pet = await db.pet.get(from);
      if (pet) {
        await db.pet.delete(from);
        await db.pet.put({ ...pet, user_id: to });
      }

      await db.foods.where('user_id').equals(from).modify({ user_id: to });
      await db.meals.where('user_id').equals(from).modify({ user_id: to });
      await db.diary_entries.where('user_id').equals(from).modify({ user_id: to });
      await db.exercise_entries
        .where('user_id')
        .equals(from)
        .modify({ user_id: to });

      const weights = await db.weight_log.where('user_id').equals(from).toArray();
      for (const w of weights) {
        await db.weight_log.delete(w.id);
        await db.weight_log.put({ ...w, user_id: to, id: `w:${to}:${w.date}` });
      }
    },
  );
}

/**
 * Adopt a sync code as this device's account: derive the id, migrate any
 * data currently keyed under the old id to it, persist it, and reset the
 * sync cursors so the next sync is a full re-pull. Returns the account id.
 */
export async function adoptSyncCode(code: string): Promise<string> {
  const id = await deriveUserId(code);
  const from = currentUserId();
  if (from !== id) {
    await rewriteUserId(from, id);
    setCurrentUserId(id);
    setCursors({});
  }
  return id;
}

/**
 * Resolve this device's account id at startup. If a code is configured but
 * the device is still on a different (or 'local') id, migrate to the
 * derived id before any seeding or syncing happens.
 */
export async function resolveUserId(): Promise<void> {
  const { token } = getSyncConfig();
  if (!token) return;
  const expected = await deriveUserId(token);
  if (currentUserId() === expected) return;
  await adoptSyncCode(token);
}
