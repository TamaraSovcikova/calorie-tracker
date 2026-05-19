import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MacroRing } from '@/components/MacroRing';
import { MacroBar } from '@/components/MacroBar';
import {
  MACRO_LABELS,
  formatKcal,
  macroTarget,
  macroValue,
  pct,
} from '@/lib/macros';
import type { DayTotals } from '@/db/repos/diary';
import type { Profile } from '@/db/types';
import type { WeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import { cn } from '@/lib/cn';

interface MacroSummaryProps {
  profile: Profile;
  totals: DayTotals;
  burnedKcal?: number;
  /** When set, the day's target is the weekly-budget-adjusted figure. */
  weekly?: WeeklyBudget | null;
}

export function MacroSummary({
  profile,
  totals,
  burnedKcal = 0,
  weekly,
}: MacroSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  // With the weekly budget on, the day's target is the recalculated
  // figure; otherwise it's the plain daily goal. `effective` adds burned
  // calories on top when eat-back is enabled.
  const baseTarget = weekly ? weekly.adjustedTarget : profile.kcal_target;
  const effective = profile.eat_back_burned ? baseTarget + burnedKcal : baseTarget;
  const remaining = Math.max(0, Math.round(effective - totals.kcal));
  const ringValue = pct(totals.kcal, effective);
  const eatBack = profile.eat_back_burned && burnedKcal > 0;
  const primary = profile.primary_macro;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-4 text-left"
        aria-expanded={expanded}
      >
        <MacroRing
          value={ringValue}
          label={formatKcal(totals.kcal)}
          sublabel="kcal"
          colorVar="kcal"
          size={120}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {weekly ? "Today's target" : 'Daily target'}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {formatKcal(baseTarget)} kcal
          </div>
          <div className="mt-1 text-sm text-muted-foreground tabular-nums">
            {totals.kcal > effective ? (
              <span className="text-destructive">
                {formatKcal(totals.kcal - effective)} over
              </span>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {formatKcal(remaining)}
                </span>{' '}
                left
              </>
            )}
          </div>
          {eatBack && (
            <div className="mt-1 text-xs text-muted-foreground">
              +{formatKcal(burnedKcal)} exercise → {formatKcal(effective)} kcal
              available
            </div>
          )}
          {burnedKcal > 0 && (
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              Net {formatKcal(totals.kcal - burnedKcal)} kcal
              <span className="text-muted-foreground/70">
                {' '}
                ({formatKcal(totals.kcal)} eaten − {formatKcal(burnedKcal)} burned)
              </span>
            </div>
          )}
          <div className="mt-2">
            <MacroBar
              label={MACRO_LABELS[primary]}
              value={macroValue(totals, primary)}
              target={macroTarget(profile, primary)}
              colorVar={primary}
            />
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {weekly && (
        <div className="mt-4 space-y-1.5 border-t border-border pt-3">
          <MacroBar
            label="This week"
            value={weekly.weekConsumed}
            target={weekly.weeklyBudget}
            colorVar="kcal"
          />
          <p className="text-xs text-muted-foreground">
            {weekly.daysRemaining} day{weekly.daysRemaining === 1 ? '' : 's'} left
            ·{' '}
            {weekly.isAdjusted
              ? weekly.adjustedTarget < weekly.dailyGoal
                ? `today trimmed to ${formatKcal(weekly.adjustedTarget)} kcal to stay on budget`
                : `today raised to ${formatKcal(weekly.adjustedTarget)} kcal from banked calories`
              : `on track — ${formatKcal(weekly.adjustedTarget)} kcal/day`}
          </p>
        </div>
      )}
      {expanded && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          <MacroBar
            label="Protein"
            value={totals.protein}
            target={profile.protein_g}
            colorVar="protein"
          />
          <MacroBar
            label="Carbs"
            value={totals.carbs}
            target={profile.carbs_g}
            colorVar="carbs"
          />
          <MacroBar
            label="Fat"
            value={totals.fat}
            target={profile.fat_g}
            colorVar="fat"
          />
        </div>
      )}
    </section>
  );
}
