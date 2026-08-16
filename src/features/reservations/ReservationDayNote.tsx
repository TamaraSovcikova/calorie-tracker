import { useNavigate } from 'react-router-dom';
import { PiggyBank, PartyPopper } from 'lucide-react';
import { format } from 'date-fns';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate } from '@/lib/dates';
import type { DayReservationEffect } from './reservations';

/**
 * The reason line on a day whose goal has been moved by a reservation.
 *
 * The point of the whole feature is that a lower target is never a mystery,
 * so this names the thing being saved for and the day it is for, on the day
 * the saving actually happens. Without it a reservation is indistinguishable
 * from the app quietly deciding to feed you less.
 */
export function ReservationDayNote({ effect }: { effect: DayReservationEffect }) {
  const navigate = useNavigate();
  if (effect.saving < 1 && effect.event < 1) return null;

  const open = () => navigate('/reserve');

  if (effect.event >= 1 && effect.hosting) {
    const { plan, reservation } = effect.hosting;
    return (
      <button
        type="button"
        onClick={open}
        className="flex w-full items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs"
      >
        <PartyPopper className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-foreground">
            {reservation.label}: {formatKcal(plan.funded)} kcal reserved.
          </span>{' '}
          <span className="text-muted-foreground">
            {plan.days.length > 0
              ? `Saved up over ${plan.days.length} day${plan.days.length === 1 ? '' : 's'}, so today's target is already higher by that much.`
              : 'Nothing could be set aside for it in the end.'}
          </span>
        </span>
      </button>
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
