import { useLiveQuery } from 'dexie-react-hooks';
import { Flame } from 'lucide-react';
import { listLoggedDates } from '@/db/repos/diary';
import { computeStreak } from './streak';

export function StreakCard() {
  const dates = useLiveQuery(() => listLoggedDates(), []);
  const streak = dates ? computeStreak(dates) : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-orange-500/10 p-3">
          <Flame
            className={
              streak > 0 ? 'h-5 w-5 text-orange-500' : 'h-5 w-5 text-muted-foreground'
            }
          />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {streak} {streak === 1 ? 'day' : 'days'}
          </div>
          <div className="text-xs text-muted-foreground">
            Logging streak — at least one food entry per day.
          </div>
        </div>
      </div>
    </section>
  );
}
