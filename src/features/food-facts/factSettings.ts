/**
 * The "food facts when logging" preference. Device-local (localStorage) —
 * a lightweight UI nicety, not synced personal data. Defaults to on.
 */

const KEY = 'calorie-tracker:food-facts';

export function isFoodFactsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(KEY) !== 'off';
}

export function setFoodFactsEnabled(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, on ? 'on' : 'off');
}
