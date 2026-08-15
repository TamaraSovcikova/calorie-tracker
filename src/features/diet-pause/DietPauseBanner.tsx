import { useNavigate } from 'react-router-dom';
import { CalendarClock, PauseCircle } from 'lucide-react';
import { format } from 'date-fns';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import { updateProfile } from '@/db/repos/profile';
import { toast } from '@/components/ui/toast';
import {
  activePause,
  daysLeftInPause,
  endPauseAt,
  parseDietPauses,
  serializeDietPauses,
  upcomingPause,
} from './dietPause';
import type { Profile } from '@/db/types';

/**
 * Says out loud why the day's target is not the usual one. Without it, a
 * maintenance week reads as the app quietly handing out 400 extra calories
 * with no explanation - which is exactly the confusion the pause is meant to
 * remove.
 *
 * Shows on every day the pause covers (including past ones, so scrolling back
 * through a finished break still explains itself), and on ordinary days when
 * a break is booked for later.
 */
export function DietPauseBanner({
  date,
  profile,
}: {
  date: LocalDate;
  profile: Profile;
}) {
  const navigate = useNavigate();
  const pause = activePause(date, profile);
  const upcoming = pause ? null : upcomingPause(date, profile);

  if (!pause && !upcoming) return null;

  if (!pause && upcoming) {
    // Only worth mentioning on today - a booked break has nothing to do with
    // a day the user happens to be scrolling back through.
    if (date !== todayLocal()) return null;
    return (
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="flex w-full items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground"
      >
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Diet pause booked from{' '}
          <span className="font-medium text-foreground">
            {format(fromLocalDate(upcoming.start), 'EEE d MMM')}
          </span>{' '}
          at {formatKcal(upcoming.kcal)} kcal/day.
        </span>
      </button>
    );
  }

  if (!pause) return null;

  const left = daysLeftInPause(pause, date);
  const isCurrent = date === todayLocal();
  const delta = Math.round(pause.kcal - (profile.kcal_target ?? 0));

  const resume = () => {
    // End yesterday so today is already back on the cut - "resume" means
    // now, not tomorrow.
    const next = endPauseAt(
      parseDietPauses(profile.diet_pauses),
      pause.id,
      shiftDate(todayLocal(), -1),
    );
    void updateProfile({ diet_pauses: serializeDietPauses(next) });
    toast({ message: 'Cut resumed', variant: 'success' });
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">
            {pause.note || 'Diet paused'} - eating at maintenance
          </div>
          <div className="mt-0.5 text-muted-foreground">
            Target {formatKcal(pause.kcal)} kcal
            {delta !== 0 && (
              <>
                {' '}
                ({delta > 0 ? '+' : '-'}
                {formatKcal(Math.abs(delta))} on your {formatKcal(profile.kcal_target)}{' '}
                cut goal)
              </>
            )}
            {left !== null
              ? `, ${left} day${left === 1 ? '' : 's'} left`
              : ', until you resume'}
            .
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground/70">
            These days are measured against {formatKcal(pause.kcal)} kcal, so
            eating to it leaves your balance level rather than reading as an
            overage.
          </div>
        </div>
      </div>
      {isCurrent && (
        <div className="mt-2 flex gap-1.5 pl-[22px]">
          <button
            type="button"
            onClick={resume}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground"
          >
            Resume cut now
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
}
