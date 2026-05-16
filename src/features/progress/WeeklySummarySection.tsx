import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useWeeklySummary } from './useWeeklySummary';
import { fromLocalDate } from '@/lib/dates';
import { formatKcal } from '@/lib/macros';
import type { Profile } from '@/db/types';

interface WeeklySummarySectionProps {
  profile: Profile;
}

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export function WeeklySummarySection({ profile }: WeeklySummarySectionProps) {
  const [range, setRange] = useState<Range>(7);
  const summary = useWeeklySummary(profile.kcal_target, range);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Last {range} days
        </h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </header>

      {!summary ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <SummaryBody summary={summary} kcalTarget={profile.kcal_target} range={range} />
      )}
    </section>
  );
}

function SummaryBody({
  summary,
  kcalTarget,
  range,
}: {
  summary: NonNullable<ReturnType<typeof useWeeklySummary>>;
  kcalTarget: number;
  range: Range;
}) {
  const maxKcal = Math.max(kcalTarget, ...summary.days.map((d) => d.kcal));

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Avg kcal" value={formatKcal(summary.avgKcal)} />
        <Stat label="Avg protein" value={`${Math.round(summary.avgProtein)} g`} />
        <Stat
          label="Days on target"
          value={`${summary.daysHitTarget}/${range}`}
          hint="±10% of kcal target"
        />
      </div>

      <div className="mt-4 flex h-24 items-end gap-1">
        {summary.days.map((d) => {
          const h = maxKcal > 0 ? Math.max(2, (d.kcal / maxKcal) * 96) : 2;
          const onTarget =
            kcalTarget > 0 &&
            d.hasEntries &&
            Math.abs(d.kcal - kcalTarget) / kcalTarget <= 0.1;
          return (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.date} — ${formatKcal(d.kcal)} kcal`}
            >
              <div
                className="w-full rounded-t-sm transition-colors"
                style={{
                  height: `${h}px`,
                  backgroundColor: onTarget
                    ? 'hsl(var(--primary))'
                    : d.hasEntries
                      ? 'hsl(var(--kcal))'
                      : 'hsl(var(--muted))',
                }}
              />
              {range <= 7 && (
                <div className="text-[10px] text-muted-foreground">
                  {format(fromLocalDate(d.date), 'EEEEE')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
