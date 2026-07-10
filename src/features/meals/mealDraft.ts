/**
 * Autosave for the in-progress "new meal" so backing out of the editor (e.g.
 * scanning an ingredient, then hitting back) doesn't discard everything. Only
 * the create flow is drafted; edits act on a saved meal already.
 *
 * Stored in localStorage (small, synchronous, survives reloads). Items keep
 * just food_id/qty/unit - the food snapshot is re-hydrated from Dexie on load.
 */

const KEY = 'ct.mealDraft.v1';

export interface MealDraftItem {
  food_id: string;
  qty: number;
  unit: string;
}

export interface MealDraft {
  name: string;
  notes: string;
  servings: number;
  categories: string[];
  categoryTouched: boolean;
  imageUrl?: string;
  items: MealDraftItem[];
  savedAt: number;
}

/** Whether a draft holds anything worth restoring. */
export function draftHasContent(d: Omit<MealDraft, 'savedAt'>): boolean {
  return (
    d.name.trim().length > 0 ||
    d.notes.trim().length > 0 ||
    d.items.length > 0 ||
    !!d.imageUrl
  );
}

export function loadMealDraft(): MealDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as MealDraft;
    if (!Array.isArray(d.items)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveMealDraft(draft: Omit<MealDraft, 'savedAt'>): void {
  try {
    if (!draftHasContent(draft)) {
      clearMealDraft();
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Quota / private-mode: drafting is best-effort, never blocks editing.
  }
}

export function clearMealDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
