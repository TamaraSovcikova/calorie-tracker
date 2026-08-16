/**
 * "Why this number?" - the one place that answers where a day's calorie
 * target came from.
 *
 * Four things can move the target off the plain daily goal, and until now
 * each explained itself somewhere different or not at all: the diet pause on
 * the diary banner, the budget adjustment on the Pet page, the eat-back on a
 * small line under the arc. A target that has been moved twice was simply a
 * different number with no account of itself.
 *
 * The steps chain: each one's `running` is the target after it applies, and
 * its `delta` is the difference from the step before. Deltas are derived
 * from ROUNDED running values rather than rounded separately, so the column
 * on screen adds up exactly - a breakdown whose arithmetic visibly fails is
 * worse than no breakdown.
 */

import { formatKcal } from '@/lib/macros';
import { isToday, type LocalDate } from '@/lib/dates';
import { activePause, daysLeftInPause } from '@/features/diet-pause/dietPause';
import {
  dayEffect,
  EMPTY_SCHEDULE,
  type DayReservationEffect,
  type ReservationSchedule,
} from '@/features/reservations/reservations';
import type { WeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import type { Profile, Reservation } from '@/db/types';

export type TargetStepKey =
  | 'base'
  | 'pause'
  | 'reservation'
  | 'budget'
  | 'eatback';

export interface TargetStep {
  key: TargetStepKey;
  label: string;
  /** One line saying what did this and why. */
  detail: string;
  /** Signed change from the previous step. Null on the base row. */
  delta: number | null;
  /** The target after this step. */
  running: number;
  /** Where to go to change it. */
  href: string;
}

export interface TargetBreakdown {
  steps: TargetStep[];
  /** The final target, equal to the last step's `running`. */
  total: number;
  /** True when anything moved the target off the base goal. */
  adjusted: boolean;
  /** Heading for the total row. */
  totalLabel: string;
}

export interface ExplainInput {
  date: LocalDate;
  profile: Profile;
  /** Null when the calorie budget is off. */
  weekly: WeeklyBudget | null;
  burnedKcal: number;
  /** Live reservations and their plan. Omit when there are none. */
  reservations?: Reservation[];
  schedule?: ReservationSchedule;
}

/** A step before its delta and rounded running value are worked out. */
type Stage = Omit<TargetStep, 'delta' | 'running'> & { value: number };

/** How the budget row describes itself, which differs per mode. */
function budgetDetail(weekly: WeeklyBudget, raised: boolean): string {
  const periodWord = weekly.periodLabel === 'month' ? 'month' : 'week';
  const daysLeft = `${weekly.daysRemaining} day${weekly.daysRemaining === 1 ? '' : 's'}`;
  if (weekly.mode === 'warn') {
    return `Working off the balance at the rate you set, ${formatKcal(weekly.catchupApplied)} kcal a day, until it clears.`;
  }
  const base = raised
    ? `What's left of this ${periodWord}'s budget spread over ${daysLeft}, so calories banked earlier come back here.`
    : `What's left of this ${periodWord}'s budget spread over ${daysLeft}.`;
  return weekly.trimHeldBack >= 1
    ? `${base} It would have dropped a further ${formatKcal(weekly.trimHeldBack)} without your daily trim limit.`
    : base;
}

/** How the pause row describes itself. */
function pauseDetail(
  note: string | undefined,
  left: number | null,
  raised: boolean,
): string {
  const what = note ? `${note}: eating` : 'Eating';
  const where = raised ? 'at maintenance' : 'at your pause target';
  const when =
    left === null
      ? 'until you resume'
      : `for ${left} more day${left === 1 ? '' : 's'}`;
  return `${what} ${where} ${when}. These days are measured against this number, so the balance stays level.`;
}

/**
 * How the reservation row describes itself. The name of the thing being
 * saved for is the whole point: a lower target with nothing attached to it
 * is exactly the confusion this feature exists to remove.
 */
function reservationDetail(effect: DayReservationEffect): string {
  if (effect.hosting && effect.event > 0) {
    const { plan, reservation } = effect.hosting;
    const days = plan.days.length;
    const saved =
      days > 0
        ? `Set aside for ${reservation.label} over ${days} day${days === 1 ? '' : 's'}.`
        : `Set aside for ${reservation.label}.`;
    const short =
      plan.shortfall >= 1
        ? ` You asked for ${formatKcal(plan.requested)}, and this is what those days could carry.`
        : '';
    return saved + short;
  }
  const names = effect.fundingFor.map((f) => f.reservation.label);
  const towards =
    names.length === 0
      ? ''
      : names.length === 1
        ? ` for ${names[0]}`
        : ` for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Put by${towards}. Today is measured against the lower number, so eating to it is on target rather than under.`;
}

/**
 * Assemble the steps that produced `date`'s target. Steps that change
 * nothing are left out entirely - a row reading "+0" is noise, and dropping
 * it cannot break the chain because its running value equals the one before.
 */
export function explainTarget({
  date,
  profile,
  weekly,
  burnedKcal,
  reservations = [],
  schedule = EMPTY_SCHEDULE,
}: ExplainInput): TargetBreakdown {
  const base = profile.kcal_target ?? 0;
  const pause = activePause(date, profile);

  // Raw running values in order. Rounding and delta derivation come after,
  // so the visible column always reconciles.
  const stages: Stage[] = [
    {
      key: 'base',
      label: 'Base goal',
      detail: 'Your daily calorie target.',
      href: '/settings',
      value: base,
    },
  ];

  if (pause) {
    stages.push({
      key: 'pause',
      label: 'Diet pause',
      detail: pauseDetail(pause.note, daysLeftInPause(pause, date), pause.kcal > base),
      href: '/settings',
      value: pause.kcal,
    });
  }

  // Reservations, before the budget: they are a plan made in advance, while
  // the budget is a reaction to days already logged.
  const effect = dayEffect(date, reservations, schedule);
  if (Math.abs(effect.net) >= 0.5) {
    const goalSoFar = stages[stages.length - 1].value;
    stages.push({
      key: 'reservation',
      label: effect.event > 0 ? 'Reserved for today' : 'Saving up',
      detail: reservationDetail(effect),
      href: '/reserve',
      value: goalSoFar + effect.net,
    });
  }

  if (weekly) {
    // `adjustedTarget` already sits on top of the day's own goal, which the
    // pause and reservation steps have applied - this row is the budget's
    // own effect on top of them.
    stages.push({
      key: 'budget',
      label: weekly.periodLabel === 'month' ? 'Monthly budget' : 'Weekly budget',
      detail: budgetDetail(weekly, weekly.adjustedTarget > weekly.dailyGoal),
      href: '/pet',
      value: weekly.adjustedTarget,
    });
  }

  const beforeEatBack = stages[stages.length - 1].value;
  if (profile.eat_back_burned && burnedKcal > 0) {
    stages.push({
      key: 'eatback',
      label: 'Exercise eaten back',
      detail:
        'Activity calories are added to your target because eat-back is on.',
      href: '/settings',
      value: beforeEatBack + burnedKcal,
    });
  }

  const rounded = stages.map((s) => Math.round(s.value));
  const steps: TargetStep[] = [];
  for (let i = 0; i < stages.length; i++) {
    const delta = i === 0 ? null : rounded[i] - rounded[i - 1];
    if (delta === 0) continue; // changed nothing; the chain is unaffected
    steps.push({ ...stages[i], delta, running: rounded[i] });
  }

  return {
    steps,
    total: rounded[rounded.length - 1],
    adjusted: steps.length > 1,
    totalLabel: isToday(date) ? "Today's target" : 'Target for this day',
  };
}
