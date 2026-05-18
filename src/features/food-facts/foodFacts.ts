/**
 * Decides whether to surface an AI nutrition fact after a food is logged,
 * fetches it from the Worker, and pushes it into the fact store.
 *
 * Kept deliberately quiet: only ~1 in 3 logs, never the same food twice in
 * a short window, and silently does nothing when facts are disabled, no
 * sync code is configured, or the network/AI is unavailable.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import type { Food } from '@/db/types';
import { isFoodFactsEnabled } from './factSettings';
import { useFoodFactStore } from './foodFactStore';

const SHOWN_KEY = 'calorie-tracker:food-facts:shown';
const SHOW_PROBABILITY = 0.34;
const SHOWN_HISTORY = 25;

function recentlyShown(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function markShown(key: string): void {
  if (typeof localStorage === 'undefined') return;
  const next = [key, ...recentlyShown().filter((k) => k !== key)].slice(
    0,
    SHOWN_HISTORY,
  );
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(next));
  } catch {
    /* storage full / unavailable — non-critical */
  }
}

export async function maybeShowFoodFact(food: Food): Promise<void> {
  if (!isFoodFactsEnabled()) return;
  const key = food.name.trim().toLowerCase();
  if (!key) return;
  if (recentlyShown().includes(key)) return;
  if (Math.random() > SHOW_PROBABILITY) return;

  const { token } = getSyncConfig();
  if (!token) return; // facts are served by the Worker — needs a sync code

  try {
    const res = await fetch(`${syncBaseUrl()}/api/food-fact`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: food.name }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { fact?: string | null };
    if (data.fact) {
      markShown(key);
      useFoodFactStore.getState().show(food.name, data.fact);
    }
  } catch {
    /* offline or AI unavailable — no fact, no problem */
  }
}
