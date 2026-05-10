/**
 * Client-side sync engine.
 *
 *   1. Collect all rows whose updated_at > cursor[table] from Dexie.
 *   2. POST { since: cursors, push: collected } to the Worker.
 *   3. Apply the response's `pull` to Dexie (last-write-wins by updated_at).
 *   4. Persist the new cursors and lastSyncAt timestamp.
 *
 * The engine is a singleton — only one in-flight sync at a time. If a
 * write happens during a sync, scheduleSync() coalesces it into the next
 * cycle.
 */

import { db } from '../dexie';
import type {
  DiaryEntry,
  ExerciseEntry,
  Food,
  Meal,
  MealItem,
  Profile,
  WeightEntry,
} from '../types';
import {
  getCursors,
  getSyncConfig,
  isConfigured,
  setCursors,
  setLastSyncAt,
  type Cursors,
} from './config';

const TABLES = [
  'profiles',
  'foods',
  'meals',
  'meal_items',
  'diary_entries',
  'exercise_entries',
  'weight_log',
] as const;
type TableName = (typeof TABLES)[number];

const EPOCH = '1970-01-01T00:00:00.000Z';

interface SyncPayload {
  since: Cursors;
  push: Partial<Record<TableName, unknown[]>>;
}

interface SyncResponse {
  pull: Partial<Record<TableName, unknown[]>>;
  until: Cursors;
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  error: string | null;
}

type Listener = (state: SyncState) => void;

class SyncEngine {
  private state: SyncState = { status: 'idle', lastSyncAt: null, error: null };
  private listeners = new Set<Listener>();
  private inFlight: Promise<void> | null = null;
  private pendingDebounce: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SyncState {
    return this.state;
  }

  private set(state: Partial<SyncState>): void {
    this.state = { ...this.state, ...state };
    for (const l of this.listeners) l(this.state);
  }

  /**
   * Sync now, ignoring debounce. Returns when sync completes or rejects on
   * error. Multiple concurrent calls share a single in-flight promise.
   */
  async syncNow(): Promise<void> {
    if (!isConfigured()) {
      this.set({ status: 'idle', error: null });
      return;
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      this.set({ status: 'syncing', error: null });
      try {
        await this.runOnce();
        const now = new Date().toISOString();
        setLastSyncAt(now);
        this.set({ status: 'ok', lastSyncAt: now, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'sync failed';
        this.set({ status: 'error', error: msg });
        throw err;
      } finally {
        this.inFlight = null;
        if (this.dirty) {
          this.dirty = false;
          this.scheduleSync();
        }
      }
    })();
    return this.inFlight;
  }

  /**
   * Schedule a sync after a debounce. Call after every write — eager but
   * coalesced. If a sync is already running, mark dirty so we re-run after
   * it finishes.
   */
  scheduleSync(): void {
    if (!isConfigured()) return;
    if (this.inFlight) {
      this.dirty = true;
      return;
    }
    if (this.pendingDebounce) clearTimeout(this.pendingDebounce);
    this.pendingDebounce = setTimeout(() => {
      this.pendingDebounce = null;
      void this.syncNow().catch(() => undefined);
    }, 1000);
  }

  private async runOnce(): Promise<void> {
    const { url, token } = getSyncConfig();
    if (!url || !token) throw new Error('Sync not configured');

    const cursors = getCursors();
    const push = await this.collectPush(cursors);

    const res = await fetch(`${url.replace(/\/$/, '')}/api/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ since: cursors, push } satisfies SyncPayload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`sync ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
    }
    const data = (await res.json()) as SyncResponse;
    await this.applyPull(data.pull);

    // Merge cursors — only advance, never go backwards.
    const merged: Cursors = { ...cursors };
    for (const t of TABLES) {
      const next = data.until[t];
      const prev = merged[t];
      if (next && (!prev || next > prev)) merged[t] = next;
    }
    setCursors(merged);
  }

  private async collectPush(
    cursors: Cursors,
  ): Promise<Partial<Record<TableName, unknown[]>>> {
    const since = (t: TableName): string => cursors[t] ?? EPOCH;
    const out: Partial<Record<TableName, unknown[]>> = {};

    out.profiles = (await db.profiles.toArray()).filter(
      (r: Profile) => r.updated_at > since('profiles'),
    );
    out.foods = (await db.foods.toArray()).filter(
      (r: Food) => r.updated_at > since('foods'),
    );
    const changedMeals = (await db.meals.toArray()).filter(
      (r: Meal) => r.updated_at > since('meals'),
    );
    out.meals = changedMeals;

    // For meal_items we tag each item with its meal's updated_at — the
    // server uses that as the row cursor since meal_items don't have their
    // own updated_at column.
    const changedMealIds = new Set(changedMeals.map((m) => m.id));
    if (changedMealIds.size > 0) {
      const items = await db.meal_items.toArray();
      const mealMap = new Map<string, string>();
      for (const m of changedMeals) mealMap.set(m.id, m.updated_at);
      out.meal_items = items
        .filter((it: MealItem) => changedMealIds.has(it.meal_id))
        .map((it) => ({ ...it, meal_updated_at: mealMap.get(it.meal_id) }));
    } else {
      out.meal_items = [];
    }

    out.diary_entries = (await db.diary_entries.toArray()).filter(
      (r: DiaryEntry) => r.updated_at > since('diary_entries'),
    );
    out.exercise_entries = (await db.exercise_entries.toArray()).filter(
      (r: ExerciseEntry) => r.updated_at > since('exercise_entries'),
    );
    out.weight_log = (await db.weight_log.toArray()).filter(
      (r: WeightEntry) => r.updated_at > since('weight_log'),
    );

    return out;
  }

  private async applyPull(
    pull: Partial<Record<TableName, unknown[]>>,
  ): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.profiles,
        db.foods,
        db.meals,
        db.meal_items,
        db.diary_entries,
        db.exercise_entries,
        db.weight_log,
      ],
      async () => {
        if (pull.profiles?.length) {
          await this.upsertWithLww(db.profiles, pull.profiles as Profile[], 'user_id');
        }
        if (pull.foods?.length) {
          await this.upsertWithLww(
            db.foods,
            (pull.foods as Food[]).map(this.deserialiseFood),
            'id',
          );
        }
        if (pull.meals?.length) {
          await this.upsertWithLww(db.meals, pull.meals as Meal[], 'id');
        }
        if (pull.meal_items?.length) {
          // Strip the synthetic meal_updated_at — Dexie's MealItem doesn't have it.
          const items = (pull.meal_items as Array<MealItem & { meal_updated_at?: string }>).map(
            ({ meal_updated_at: _ignore, ...rest }) => rest,
          );
          // meal_items don't carry their own updated_at — replace blindly.
          await db.meal_items.bulkPut(items);
        }
        if (pull.diary_entries?.length) {
          await this.upsertWithLww(
            db.diary_entries,
            pull.diary_entries as DiaryEntry[],
            'id',
          );
        }
        if (pull.exercise_entries?.length) {
          await this.upsertWithLww(
            db.exercise_entries,
            pull.exercise_entries as ExerciseEntry[],
            'id',
          );
        }
        if (pull.weight_log?.length) {
          await this.upsertWithLww(
            db.weight_log,
            pull.weight_log as WeightEntry[],
            'id',
          );
        }
      },
    );
  }

  private deserialiseFood = (f: Food & { custom_units: unknown }): Food => {
    // SQLite stores JSON as TEXT; D1 returns it as a string we need to parse.
    if (typeof f.custom_units === 'string') {
      try {
        return { ...f, custom_units: JSON.parse(f.custom_units) };
      } catch {
        return { ...f, custom_units: [] };
      }
    }
    return f as Food;
  };

  private async upsertWithLww<T extends { updated_at: string }>(
    table: { get: (key: string) => Promise<T | undefined>; put: (row: T) => Promise<unknown> },
    rows: T[],
    pkField: string,
  ): Promise<void> {
    for (const row of rows) {
      const pk = (row as Record<string, unknown>)[pkField] as string;
      const existing = await table.get(pk);
      if (!existing || row.updated_at > existing.updated_at) {
        // Convert SQLite 0/1 booleans back to real booleans for known fields.
        await table.put(this.normaliseInbound(row));
      }
    }
  }

  private normaliseInbound<T>(row: T): T {
    const r = row as Record<string, unknown>;
    for (const k of [
      'eat_back_burned',
      'fitbit_connected',
      'onboarded',
    ]) {
      if (typeof r[k] === 'number') r[k] = r[k] === 1;
    }
    return r as T;
  }
}

export const syncEngine = new SyncEngine();

// React hook
import { useEffect, useState } from 'react';
export function useSyncStatus(): SyncState {
  const [state, setState] = useState<SyncState>(() => syncEngine.getState());
  useEffect(() => syncEngine.subscribe(setState), []);
  return state;
}
