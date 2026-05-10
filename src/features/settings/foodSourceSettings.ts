/**
 * Tiny localStorage-backed setting layer for the food-search panel —
 * separate from the Dexie profile because these are per-device knobs
 * (the USDA API key especially shouldn't sync via Cloud sync).
 *
 * A naive event emitter lets the search hook react to settings changes
 * without prop-drilling.
 */

const SHOW_PACKAGED_KEY = 'calorie-tracker:show-packaged';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToFoodSourceSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const l of listeners) l();
}

export function getShowPackaged(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(SHOW_PACKAGED_KEY);
  // Default ON: new users still see all results until they choose to filter.
  if (raw === null) return true;
  return raw === 'true';
}

export function setShowPackaged(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SHOW_PACKAGED_KEY, value ? 'true' : 'false');
  emit();
}

/** Manually emit — used after the USDA key changes so search re-runs. */
export function notifyFoodSourceChanged(): void {
  emit();
}
