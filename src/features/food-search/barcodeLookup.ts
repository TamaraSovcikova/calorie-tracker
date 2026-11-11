import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { recordFoodSeen } from '@/db/repos/diary';
import { lookupBarcode } from '@/lib/off-api';
import type { Food } from '@/db/types';

/**
 * Resolve a scanned barcode to a food: the stored copy if this product was
 * scanned before (instant, offline, and no call against the Open Food Facts
 * rate limit), otherwise a fresh lookup that is saved for next time.
 *
 * Either way the scan is recorded, so the product shows under Recent even
 * if nothing is logged. Returns null when the product is not known, and
 * lets lookup errors (rate limit, offline) through to the caller.
 *
 * One function because the diary, the meal builder and the compare tool
 * each scan, and each had its own copy that had drifted: the meal builder's
 * forgot to record the scan.
 */
export async function findFoodByBarcode(code: string): Promise<Food | null> {
  const cached = await db.foods
    .where('user_id')
    .equals(currentUserId())
    .filter(
      (f) => !f.deleted_at && (f.id === `off:${code}` || f.off_barcode === code),
    )
    .first();
  if (cached) {
    void recordFoodSeen(cached.id);
    return cached;
  }
  const food = await lookupBarcode(code);
  if (!food) return null;
  await db.foods.put(food);
  void recordFoodSeen(food.id);
  return food;
}
