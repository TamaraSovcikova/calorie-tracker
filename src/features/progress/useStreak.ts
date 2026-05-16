import { useLiveQuery } from 'dexie-react-hooks';
import { listLoggedDates } from '@/db/repos/diary';
import { computeStreakStats, type StreakStats } from './streak';

const EMPTY: StreakStats = { current: 0, longest: 0, totalDays: 0 };

/** Live streak stats — current run, longest run, total days logged. */
export function useStreak(): StreakStats {
  const dates = useLiveQuery(() => listLoggedDates(), []);
  return dates ? computeStreakStats(dates) : EMPTY;
}
