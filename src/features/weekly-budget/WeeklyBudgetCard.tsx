import { MacroBar } from '@/components/MacroBar';
import { formatKcal } from '@/lib/macros';
import type { WeeklyBudget } from './weeklyBudget';

/**
 * The full budget breakdown — lives on the Pet page so the diary stays
 * uncluttered (the diary just tints today's target instead). Adapts its
 * wording to the active period (week or month).
 */
export function WeeklyBudgetCard({ weekly }: { weekly: WeeklyBudget }) {
  const isMonth = weekly.periodLabel === 'month';
  const periodWord = isMonth ? 'month' : 'week';
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
        {weekly.isAdjusted
          ? weekly.adjustedTarget < weekly.dailyGoal
            ? `Today trimmed to ${formatKcal(weekly.adjustedTarget)} kcal to stay on budget.`
            : `Today raised to ${formatKcal(weekly.adjustedTarget)} kcal from calories banked earlier this ${periodWord}.`
          : `On track — ${formatKcal(weekly.adjustedTarget)} kcal/day.`}
      </p>
      {weekly.carryIn !== 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {weekly.carryIn < 0
            ? `Carried over ${formatKcal(-weekly.carryIn)} kcal of overage from last ${periodWord}.`
            : `Carried over ${formatKcal(weekly.carryIn)} kcal banked from last ${periodWord}.`}
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
