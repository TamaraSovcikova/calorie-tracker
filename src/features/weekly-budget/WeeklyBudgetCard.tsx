import { format } from 'date-fns';
import { MacroBar } from '@/components/MacroBar';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate } from '@/lib/dates';
import type { WeeklyBudget } from './weeklyBudget';

/**
 * The full budget breakdown - lives on the Pet page so the diary stays
 * uncluttered (the diary shows the running balance and tints the target).
 * Adapts its wording to the active period and mode.
 */
export function WeeklyBudgetCard({ weekly }: { weekly: WeeklyBudget }) {
  const isMonth = weekly.periodLabel === 'month';
  const periodWord = isMonth ? 'month' : 'week';
  const warnOnly = weekly.mode === 'warn';
  const balance = Math.round(weekly.carryBalance);
  const fromLabel = format(fromLocalDate(weekly.balanceFrom), 'd MMM');

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {isMonth ? 'Monthly' : 'Weekly'} calorie budget
        </span>
        <span className="text-xs text-muted-foreground">
          {weekly.daysRemaining} day{weekly.daysRemaining === 1 ? '' : 's'} left
        </span>
      </div>
      <div className="mt-3">
        <MacroBar
          label={isMonth ? 'This month' : 'This week'}
          value={weekly.weekConsumed}
          target={weekly.weeklyBudget}
          colorVar="kcal"
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {warnOnly
          ? `Target held at ${formatKcal(weekly.dailyGoal)} kcal/day - nothing is trimmed for you.`
          : weekly.isAdjusted
            ? weekly.adjustedTarget < weekly.dailyGoal
              ? `Today trimmed to ${formatKcal(weekly.adjustedTarget)} kcal to stay on budget.`
              : `Today raised to ${formatKcal(weekly.adjustedTarget)} kcal from calories banked earlier this ${periodWord}.`
            : `On track - ${formatKcal(weekly.adjustedTarget)} kcal/day.`}
      </p>

      {/* The running balance, always on its own line: it is the number the
          user acts on when they choose to even things out themselves. */}
      {Math.abs(balance) >= 1 && (
        <p className="mt-1 text-xs font-medium">
          {balance < 0 ? (
            <span className="text-amber-600 dark:text-amber-400">
              {formatKcal(-balance)} kcal over since {fromLabel}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {formatKcal(balance)} kcal banked since {fromLabel}
            </span>
          )}
        </p>
      )}

      {weekly.carryIn !== 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {weekly.carryIn < 0
            ? `${formatKcal(-weekly.carryIn)} kcal of that carried into this ${periodWord}'s budget.`
            : `${formatKcal(weekly.carryIn)} kcal of that carried into this ${periodWord}'s budget.`}
        </p>
      )}
      {weekly.trimHeldBack >= 1 && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Trim capped: today would have dropped a further{' '}
          {formatKcal(weekly.trimHeldBack)} kcal without your daily limit.
        </p>
      )}
      {weekly.missedCount > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {weekly.missedCount} day{weekly.missedCount === 1 ? '' : 's'} this{' '}
          {periodWord} counted as on-target (not fully tracked).
        </p>
      )}
    </section>
  );
}
