import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { formatKcal } from '@/lib/macros';
import { explainTarget, type TargetStep } from './targetBreakdown';
import {
  EMPTY_SCHEDULE,
  type ReservationSchedule,
} from '@/features/reservations/reservations';
import type { WeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import type { LocalDate } from '@/lib/dates';
import type { Profile, Reservation } from '@/db/types';

/** One line of the ledger. The base row has no delta and no arrow. */
function StepRow({ step, onGo }: { step: TargetStep; onGo: () => void }) {
  const isBase = step.delta === null;
  return (
    <button
      type="button"
      onClick={onGo}
      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm font-medium">
          {step.label}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {step.detail}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {!isBase && (
          <div
            className={
              (step.delta as number) > 0
                ? 'text-sm font-semibold text-primary'
                : 'text-sm font-semibold text-amber-600 dark:text-amber-400'
            }
          >
            {(step.delta as number) > 0 ? '+' : '-'}
            {formatKcal(Math.abs(step.delta as number))}
          </div>
        )}
        <div
          className={
            isBase
              ? 'text-sm font-semibold'
              : 'text-xs text-muted-foreground'
          }
        >
          {formatKcal(step.running)}
        </div>
      </div>
    </button>
  );
}

/**
 * The ledger behind a day's calorie target: base goal, then every step that
 * moved it, then the total. Each row taps through to whatever set it.
 *
 * Shown for any day, not only adjusted ones - "nothing moved it" is an
 * answer worth being able to get.
 */
export function TargetBreakdownSheet({
  open,
  onClose,
  date,
  profile,
  weekly,
  burnedKcal,
  reservations = [],
  schedule = EMPTY_SCHEDULE,
}: {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  profile: Profile;
  weekly: WeeklyBudget | null;
  burnedKcal: number;
  reservations?: Reservation[];
  schedule?: ReservationSchedule;
}) {
  const navigate = useNavigate();
  const breakdown = explainTarget({
    date,
    profile,
    weekly,
    burnedKcal,
    reservations,
    schedule,
  });

  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Why this number?"
      fullScreenMobile={false}
    >
      <div className="divide-y divide-border">
        {breakdown.steps.map((step) => (
          <StepRow key={step.key} step={step} onGo={() => go(step.href)} />
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t-2 border-border px-4 py-3.5">
        <span className="text-sm font-semibold">{breakdown.totalLabel}</span>
        <span className="text-lg font-semibold tabular-nums">
          {formatKcal(breakdown.total)} kcal
        </span>
      </div>

      {!breakdown.adjusted && (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Nothing moved it. This is your daily goal, straight from Settings.
        </p>
      )}

      <p className="px-4 pb-5 text-[11px] leading-relaxed text-muted-foreground/70">
        Steps apply in this order: your goal, then a diet pause, then the
        calorie budget, then exercise. The budget reacts to days already
        logged, so it comes after anything you planned.
      </p>
    </Sheet>
  );
}
