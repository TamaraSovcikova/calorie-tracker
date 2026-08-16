/**
 * Daily wellbeing roll-forward - runs once at startup. Every un-evaluated
 * completed day (after `wellbeing_evaluated_date`, before today) is folded
 * into the pet's wellbeing score via the pure `rollWellbeing`. Today is
 * never evaluated - it's still in progress.
 */

import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { getPet, updatePet } from '@/db/repos/pet';
import { getProfile } from '@/db/repos/profile';
import { shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import { computeWeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import {
  composedGoalResolver,
  loadSchedule,
} from '@/features/reservations/dailyGoal';
import { rollWellbeing, type DayOutcome } from './wellbeing';

/** How that day went: logged at all, hit the goal, or went over. */
async function dayOutcome(
  date: LocalDate,
  goalKcal: number,
): Promise<DayOutcome> {
  const rows = await db.diary_entries
    .where('[user_id+date]')
    .equals([currentUserId(), date])
    .filter((e) => !e.deleted_at)
    .toArray();

  const logged = rows.length > 0;
  const kcal = rows.reduce((sum, e) => sum + e.kcal, 0);
  const hitGoal =
    logged && goalKcal > 0 && Math.abs(kcal - goalKcal) / goalKcal <= 0.1;
  const overGoal = goalKcal > 0 && kcal / goalKcal > 1.1;
  return { logged, hitGoal, overGoal };
}

/** Roll the wellbeing score forward over any elapsed, un-evaluated days. */
export async function runWellbeingRollForward(): Promise<void> {
  const [pet, profile] = await Promise.all([getPet(), getProfile()]);
  if (!pet || !profile) return;

  const yesterday = shiftDate(todayLocal(), -1);
  if (pet.wellbeing_evaluated_date >= yesterday) return; // already current

  const outcomes: DayOutcome[] = [];
  // Judge each day against the goal that was in force on it, so a finished
  // maintenance break isn't scored as a week of overeating and a day that
  // was funding a reservation isn't scored against a target it never had.
  const goalOn = composedGoalResolver(profile, await loadSchedule(profile));
  let cursor = shiftDate(pet.wellbeing_evaluated_date, 1);
  // Guard against a wildly stale evaluated_date producing an endless loop.
  for (let guard = 0; cursor <= yesterday && guard < 400; guard++) {
    // With the weekly budget on, judge each day against that day's
    // recalculated target rather than the flat daily goal.
    const wb = profile.weekly_budget_enabled
      ? await computeWeeklyBudget(cursor, profile)
      : null;
    outcomes.push(await dayOutcome(cursor, wb?.adjustedTarget ?? goalOn(cursor)));
    cursor = shiftDate(cursor, 1);
  }
  if (outcomes.length === 0) return;

  await updatePet({
    wellbeing: rollWellbeing(pet.wellbeing, outcomes),
    wellbeing_evaluated_date: yesterday,
  });
}
