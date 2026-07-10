import type { MealSection } from '@/db/types';

/**
 * The meal section a log most likely belongs to at a given clock time - used
 * to pre-select the section for quick-add so the common case needs no taps.
 *
 *   04:00-10:59  breakfast
 *   11:00-14:59  lunch
 *   17:00-21:59  dinner
 *   otherwise    snacks   (mid-afternoon and late night)
 */
export function defaultMealSection(now: Date = new Date()): MealSection {
  const h = now.getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snacks';
}
