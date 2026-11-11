import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../dexie';
import { currentUserId } from '../userId';
import type { FoodPrice } from '../types';

/** Pack price and size per food id, live. */
export function useFoodPrices(): Map<string, FoodPrice> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.food_prices
      .where('user_id')
      .equals(currentUserId())
      .toArray();
    return new Map(rows.map((r) => [r.food_id, r]));
  }, []);
}

/** Set (or clear, with undefined) a product's pack price and/or size. */
export async function setFoodPrice(
  foodId: string,
  patch: Pick<FoodPrice, 'price' | 'pack_g'>,
): Promise<void> {
  const userId = currentUserId();
  const id = `${userId}:${foodId}`;
  const existing = await db.food_prices.get(id);
  await db.food_prices.put({
    ...existing,
    ...patch,
    id,
    user_id: userId,
    food_id: foodId,
    updated_at: new Date().toISOString(),
  });
}
