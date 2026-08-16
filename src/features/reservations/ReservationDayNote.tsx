import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PiggyBank, PartyPopper, Utensils } from 'lucide-react';
import { format } from 'date-fns';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate, type LocalDate } from '@/lib/dates';
import { toast } from '@/components/ui/toast';
import {
  isLoggable,
  loggedForReservation,
  logReservedItem,
  outcomeOf,
} from './logReserved';
import type { DayReservationEffect } from './reservations';

/**
 * The reason line on a day whose goal has been moved by a reservation.
 *
 * The point of the whole feature is that a lower target is never a mystery,
 * so this names the thing being saved for and the day it is for, on the day
 * the saving actually happens. Without it a reservation is indistinguishable
 * from the app quietly deciding to feed you less.
 *
 * On the day itself it also closes the loop: log the reserved item in one
 * tap, then report against the reservation rather than against the day.
 */
export function ReservationDayNote({
  effect,
  date,
}: {
  effect: DayReservationEffect;
  date: LocalDate;
}) {
  const navigate = useNavigate();
  const hosting = effect.hosting;
  const reservation = hosting?.reservation;

  // Only meaningful for a reservation that names a real food or meal - a
  // bare number cannot know which of the day's calories were "the cake",
  // and guessing would be worse than saying nothing.
  const logged = useLiveQuery(
    () =>
      reservation && isLoggable(reservation)
        ? loggedForReservation(reservation, date)
        : Promise.resolve(0),
    [reservation?.id, date],
  );

  if (effect.saving < 1 && effect.event < 1) return null;

  const open = () => navigate('/reserve');

  if (effect.event >= 1 && hosting && reservation) {
    const { plan } = hosting;
    const outcome = outcomeOf(plan.funded, logged ?? 0);
    const canLog = isLoggable(reservation) && !outcome.anyLogged;

    const doLog = async () => {
      const ok = await logReservedItem(reservation, date);
      toast(
        ok
          ? { message: `${reservation.label} logged`, variant: 'success' }
          : {
              message: "That food isn't in your library any more",
              variant: 'error',
            },
      );
    };

    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <div className="flex items-start gap-2">
          <PartyPopper className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <button
            type="button"
            onClick={open}
            className="min-w-0 flex-1 text-left"
          >
            <span className="font-medium text-foreground">
              {reservation.label}: {formatKcal(plan.funded)} kcal reserved.
            </span>{' '}
            <span className="text-muted-foreground">
              {plan.days.length > 0
                ? `Saved up over ${plan.days.length} day${plan.days.length === 1 ? '' : 's'}, so today's target is already higher by that much.`
                : 'Nothing could be set aside for it in the end.'}
            </span>
          </button>
        </div>

        {/* Reporting against the reservation, not against the day: naming
            the thing that went over is the useful sentence. */}
        {outcome.anyLogged && (
          <div className="mt-1.5 pl-[22px] tabular-nums text-muted-foreground">
            Logged {formatKcal(outcome.logged)} kcal.{' '}
            {Math.abs(outcome.difference) < 1 ? (
              <span className="font-medium text-foreground">
                Exactly what you set aside.
              </span>
            ) : outcome.difference > 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {formatKcal(outcome.difference)} more than reserved.
              </span>
            ) : (
              <span className="font-medium text-foreground">
                {formatKcal(-outcome.difference)} under what you reserved.
              </span>
            )}
          </div>
        )}

        {canLog && (
          <div className="mt-2 pl-[22px]">
            <button
              type="button"
              onClick={() => void doLog()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground"
            >
              <Utensils className="h-3 w-3" />
              Log {reservation.label}
            </button>
          </div>
        )}
      </div>
    );
  }

  const names = effect.fundingFor.map((f) => f.reservation.label);
  const when = effect.fundingFor
    .map((f) => format(fromLocalDate(f.reservation.date), 'EEE d MMM'))
    .join(', ');

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-left text-xs"
    >
      <PiggyBank className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">
          {formatKcal(effect.saving)} kcal put by for{' '}
          {names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}{' '}
          ({when}).
        </span>{' '}
        <span className="text-muted-foreground">
          Today's target is lower by that much. Eating to it counts as on
          target, not under, so nothing is owed back later.
        </span>
      </span>
    </button>
  );
}
