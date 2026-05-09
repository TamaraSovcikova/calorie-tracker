import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MacroRing } from '@/components/MacroRing';
import { MacroBar } from '@/components/MacroBar';
import {
  MACRO_LABELS,
  effectiveKcalTarget,
  formatKcal,
  macroTarget,
  macroValue,
  pct,
} from '@/lib/macros';
import type { DayTotals } from '@/db/repos/diary';
import type { Profile } from '@/db/types';
import { cn } from '@/lib/cn';

interface MacroSummaryProps {
  profile: Profile;
  totals: DayTotals;
  burnedKcal?: number;
}

export function MacroSummary({ profile, totals, burnedKcal = 0 }: MacroSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const target = effectiveKcalTarget(profile, burnedKcal);
  const remaining = Math.max(0, Math.round(target - totals.kcal));
  const ringValue = pct(totals.kcal, target);
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
            Daily target
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {formatKcal(target)} kcal
          </div>
          <div className="mt-1 text-sm text-muted-foreground tabular-nums">
            {totals.kcal > target ? (
              <span className="text-destructive">
                {formatKcal(totals.kcal - target)} over
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
          {burnedKcal > 0 && profile.eat_back_burned && (
            <div className="mt-1 text-xs text-muted-foreground">
              +{formatKcal(burnedKcal)} from exercise
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
        </div>
      )}
    </section>
  );
}
