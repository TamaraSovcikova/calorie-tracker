import { Flame } from 'lucide-react';
import { useStreak } from './useStreak';

export function StreakCard() {
  const { current, longest, totalDays } = useStreak();

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-orange-500/10 p-3">
          <Flame
            className={
              current > 0 ? 'h-5 w-5 text-orange-500' : 'h-5 w-5 text-muted-foreground'
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-semibold tabular-nums">
            {current} {current === 1 ? 'day' : 'days'}
          </div>
          <div className="text-xs text-muted-foreground">
            Logging streak — at least one entry per day.
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <Stat label="Best streak" value={`${longest} ${longest === 1 ? 'day' : 'days'}`} />
        <Stat label="Days logged" value={String(totalDays)} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
