import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { fromLocalDate } from '@/lib/dates';
import { formatKcal } from '@/lib/macros';
import type { Profile } from '@/db/types';
import { setDayMark, useSuspectDay } from './useSuspectDay';

/** Quick "about how much over" answers, kcal relative to the day's goal. */
const OVER_STEPS = [0, 250, 500, 750, 1000, 1500] as const;

/**
 * "This day looks light. Did you forget something?"
 *
 * Shown on today's diary for the most recent finished day logged at under
 * 60% of its goal. A half-logged day taken at face value reads as a big
 * deficit: it banks calories in the weekly budget that were never saved and
 * drags the daily average down. Four ways out, all one or two taps:
 * go and log it, confirm it, leave the day out, or give a rough estimate.
 */
export function UnderLoggedCard({ profile }: { profile: Profile }) {
  const { day, skip } = useSuspectDay(profile);
  const navigate = useNavigate();
  const [estimating, setEstimating] = useState(false);
  if (!day) return null;

  const label = format(fromLocalDate(day.date), 'EEEE d MMM');
  const answer = (mark: Parameters<typeof setDayMark>[2], message: string) => {
    setEstimating(false);
    void setDayMark(profile, day.date, mark).then(() =>
      toast({ message, variant: 'success' }),
    );
  };

  return (
    <section className="relative rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <button
        type="button"
        onClick={skip}
        aria-label="Not now"
        className="tap-target absolute right-1.5 top-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-1.5 pr-8 text-sm font-semibold">
        <CalendarSearch className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        Did you log everything on {label}?
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {formatKcal(day.kcal)} of {formatKcal(day.goal)} kcal logged.
      </p>

      {estimating ? (
        <div className="mt-3">
          <p className="text-xs font-medium">Roughly how did the day end up?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {OVER_STEPS.map((over) => (
              <button
                key={over}
                type="button"
                onClick={() =>
                  answer(
                    { over },
                    over === 0
                      ? `${label} counted as on goal`
                      : `${label} counted as ${formatKcal(day.goal + over)} kcal`,
                  )
                }
                className="tap-target rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium tabular-nums hover:bg-muted"
              >
                {over === 0 ? 'About on goal' : `+${over}`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEstimating(false)}
            className="mt-2 text-xs text-muted-foreground underline"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate(`/diary/${day.date}`)}
          >
            Add what I forgot
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEstimating(true)}>
            I went over
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => answer({}, `${label} left out of your totals`)}
          >
            Don't count it
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => answer({ ok: true }, `${label} kept as logged`)}
          >
            That's everything
          </Button>
        </div>
      )}
    </section>
  );
}
