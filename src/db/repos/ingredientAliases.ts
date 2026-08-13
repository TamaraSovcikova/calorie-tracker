/**
 * Learned ingredient aliases.
 *
 * A recipe says "beef mince"; the product actually bought in Brussels is
 * named in French and shares no words with it. No amount of scoring tuning
 * connects those, and no bundled word list will ever contain a supermarket
 * brand - so the app remembers the answer the user gave.
 *
 * Written when a food is picked in the recipe-scan review, read first on
 * every later scan.
 */

import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { Food, IngredientAlias } from '../types';

/**
 * Normalise an ingredient phrase to a stable key. Lowercased, de-accented,
 * punctuation and runs of whitespace collapsed, so "Haché de bœuf," and
 * "hache de boeuf" are the same alias.
 */
export function aliasPhrase(name: string): string {
  return name
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Deterministic id, so the same pick on two devices is one row. */
function aliasId(userId: string, phrase: string): string {
  return `ia:${userId}:${phrase}`;
}

/** The food the user last chose for this ingredient phrase, if any. */
export async function getAliasFood(name: string): Promise<Food | null> {
  const phrase = aliasPhrase(name);
  if (!phrase) return null;
  const row = await db.ingredient_aliases
    .where('[user_id+phrase]')
    .equals([currentUserId(), phrase])
    .first()
    .catch(() => undefined);
  if (!row) return null;
  const food = await db.foods.get(row.food_id).catch(() => undefined);
  // The food may have been deleted since; treat that as no alias rather
  // than resolving to a dangling id.
  return food && !food.deleted_at ? food : null;
}

/** Remember that `name` means `foodId` for this user. Upserts. */
export async function rememberAlias(
  name: string,
  foodId: string,
): Promise<void> {
  const phrase = aliasPhrase(name);
  if (!phrase || !foodId) return;
  const userId = currentUserId();
  const now = new Date().toISOString();
  const id = aliasId(userId, phrase);
  const existing = await db.ingredient_aliases.get(id).catch(() => undefined);
  const row: IngredientAlias = {
    id,
    user_id: userId,
    phrase,
    food_id: foodId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await db.ingredient_aliases.put(row).catch(() => undefined);
}

/** Forget an alias - used when the remembered food turns out to be wrong. */
export async function forgetAlias(name: string): Promise<void> {
  const phrase = aliasPhrase(name);
  if (!phrase) return;
  await db.ingredient_aliases
    .delete(aliasId(currentUserId(), phrase))
    .catch(() => undefined);
}

/** Every alias this user has taught the app, newest first. */
export async function listAliases(): Promise<IngredientAlias[]> {
  const rows = await db.ingredient_aliases
    .where('user_id')
    .equals(currentUserId())
    .toArray()
    .catch(() => [] as IngredientAlias[]);
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
