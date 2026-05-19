import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
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

  // Tint today's target when the weekly budget has moved it: green when
  // raised (banked room), amber when trimmed. Full breakdown is on the
  // Pet page.
  const targetTone =
    weekly && weekly.isAdjusted
      ? weekly.adjustedTarget > weekly.dailyGoal
        ? 'up'
        : 'down'
      : null;
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
          <div
            className={cn(
              'flex items-center gap-1 text-lg font-semibold tabular-nums',
              targetTone === 'up' && 'text-primary',
              targetTone === 'down' && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {targetTone === 'up' && <ArrowUp className="h-4 w-4 shrink-0" />}
            {targetTone === 'down' && <ArrowDown className="h-4 w-4 shrink-0" />}
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
          <div className="flex justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground tabular-nums">
            <span>Fibre {Math.round(totals.fiber)} g</span>
            <span>Sugar {Math.round(totals.sugar)} g</span>
            <span>Sodium {Math.round(totals.sodium).toLocaleString()} mg</span>
          </div>
        </div>
      )}
    </section>
  );
}
