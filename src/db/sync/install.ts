/**
 * Wire up automatic sync triggers. Imported from main.tsx after seed.
 *
 *  - Dexie hooks on every table: any write nudges the sync engine, which
 *    debounces 1s before posting to the worker.
 *  - Window focus event: trigger an immediate sync on tab refocus so the
 *    user sees fresh data when they come back from the other device.
 *  - On startup: if configured, run an initial sync to pull anything
 *    written elsewhere since we were last open.
 */

import { db } from '../dexie';
import { isConfigured, getCursors } from './config';
import { syncEngine } from './client';

const TABLES = [
  db.profiles,
  db.foods,
  db.meals,
  db.meal_items,
  db.diary_entries,
  db.exercise_entries,
  db.weight_log,
  db.pet,
] as const;

let installed = false;

export function installSync(): void {
  if (installed) return;
  installed = true;

  for (const t of TABLES) {
    // Cast — Dexie's hook signatures are mutually exclusive per event name.
    const hookable = t as unknown as {
      hook(event: 'creating', cb: () => void): void;
      hook(event: 'updating', cb: () => void): void;
      hook(event: 'deleting', cb: () => void): void;
    };
    hookable.hook('creating', () => syncEngine.scheduleSync());
    hookable.hook('updating', () => syncEngine.scheduleSync());
    hookable.hook('deleting', () => syncEngine.scheduleSync());
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      if (isConfigured()) void syncEngine.syncNow().catch(() => undefined);
    });
    window.addEventListener('online', () => {
      if (isConfigured()) void syncEngine.syncNow().catch(() => undefined);
    });
  }

  // Initial sync at boot (only if configured). We log the cursor count so
  // the dev console gives a sanity check.
  if (isConfigured()) {
    const cursors = getCursors();
    const cursorTables = Object.keys(cursors).length;
    if (cursorTables === 0) {
      // First sync ever — pulls everything.
      void syncEngine.syncNow().catch((e) => console.warn('initial sync', e));
    } else {
      void syncEngine.syncNow().catch(() => undefined);
    }
  }
}
