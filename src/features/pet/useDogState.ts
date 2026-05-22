import { differenceInCalendarDays } from 'date-fns';
import { useProfile } from '@/db/repos/profile';
import { usePet } from '@/db/repos/pet';
import {
  sumTotals,
  useDiaryDay,
  useLastLoggedDate,
  ZERO_TOTALS,
} from '@/db/repos/diary';
import { useWeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import { fromLocalDate, todayLocal } from '@/lib/dates';
import {
  dogPose,
  dogStatusLine,
  fullnessState,
  type DogPose,
  type FullnessState,
} from './petLogic';
import { useDevPoseStore } from './devPose';

export interface DogState {
  pose: DogPose;
  fullness: FullnessState;
  petName: string;
  wellbeing: number;
  loggedKcal: number;
  goalKcal: number;
  statusLine: string;
  /** False until profile, pet and today's diary have all loaded. */
  ready: boolean;
}

interface DogStateOptions {
  /** Transient: the user just logged food — show the eating pose. */
  justAte?: boolean;
  /** Transient: the app was just opened — show the greeting pose. */
  greeting?: boolean;
}

/**
 * Resolves the dog's current state from the live app data — today's
 * diary against the calorie goal and the clock (fullness), plus the
 * stored wellbeing score.
 */
export function useDogState(opts: DogStateOptions = {}): DogState {
  const profile = useProfile();
  const pet = usePet();
  const entries = useDiaryDay(todayLocal());
  const weekly = useWeeklyBudget(todayLocal(), profile);
  const lastLogged = useLastLoggedDate();

  const totals = entries ? sumTotals(entries) : ZERO_TOTALS;
  // With the weekly budget on, the dog reads today's adjusted target.
  const goalKcal = weekly?.adjustedTarget ?? profile?.kcal_target ?? 0;
  const wellbeing = pet?.wellbeing ?? 70;
  const petName = pet?.name ?? 'Biscuit';
  const now = new Date();

  // Days since the last logged entry. A user who has never logged (no
  // lastLogged date) gets 0, so a brand-new install isn't greeted by a
  // skeleton.
  const daysSinceLastLog = lastLogged
    ? differenceInCalendarDays(now, fromLocalDate(lastLogged))
    : 0;

  const fullness = fullnessState(totals.kcal, goalKcal, now);
  const livePose = dogPose({
    fullness,
    wellbeing,
    now,
    daysSinceLastLog,
    justAte: opts.justAte,
    greeting: opts.greeting,
  });

  // Dev-only: a forced pose from the dev console / panel wins. Stripped in
  // production builds (import.meta.env.DEV is false), so live state always
  // applies for real users.
  const forcedPose = useDevPoseStore((s) => s.forced);
  const pose = import.meta.env.DEV && forcedPose ? forcedPose : livePose;

  return {
    pose,
    fullness,
    petName,
    wellbeing,
    loggedKcal: totals.kcal,
    goalKcal,
    statusLine: dogStatusLine(pose, petName),
    ready: !!profile && !!pet && entries !== undefined,
  };
}
