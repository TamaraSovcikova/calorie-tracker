import { useProfile } from '@/db/repos/profile';
import { usePet } from '@/db/repos/pet';
import { sumTotals, useDiaryDay, ZERO_TOTALS } from '@/db/repos/diary';
import { todayLocal } from '@/lib/dates';
import {
  dogPose,
  dogStatusLine,
  fullnessState,
  type DogPose,
  type FullnessState,
} from './petLogic';

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

  const totals = entries ? sumTotals(entries) : ZERO_TOTALS;
  const goalKcal = profile?.kcal_target ?? 0;
  const wellbeing = pet?.wellbeing ?? 70;
  const petName = pet?.name ?? 'Biscuit';
  const now = new Date();

  const fullness = fullnessState(totals.kcal, goalKcal, now);
  const pose = dogPose({
    fullness,
    wellbeing,
    now,
    justAte: opts.justAte,
    greeting: opts.greeting,
  });

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
