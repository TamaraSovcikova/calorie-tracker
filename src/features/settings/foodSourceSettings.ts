/**
 * Tiny localStorage-backed setting layer for the food-search panel -
 * separate from the Dexie profile because these are per-device knobs
 * (the USDA API key especially shouldn't sync via Cloud sync).
 *
 * A naive event emitter lets the search hook react to settings changes
 * without prop-drilling.
 */

const SHOW_PACKAGED_KEY = 'calorie-tracker:show-packaged';
const CONTRIBUTE_SHARED_KEY = 'calorie-tracker:contribute-shared';

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

/**
 * Opt-in: contribute the foods you enter manually to the shared community
 * food database, so anyone (including future-you on a fresh device) can find
 * them without re-typing. Default OFF - contributing publishes the product's
 * name + macros to a shared pool, so it's an explicit choice.
 */
export function getContributeShared(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(CONTRIBUTE_SHARED_KEY) === 'true';
}

export function setContributeShared(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CONTRIBUTE_SHARED_KEY, value ? 'true' : 'false');
  emit();
}

/** Manually emit - used after the USDA key changes so search re-runs. */
export function notifyFoodSourceChanged(): void {
  emit();
}
