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

      <div className="relative mt-4 h-24">
        {/* Dashed line marking the daily kcal target so over/under is obvious. */}
        {kcalTarget > 0 && maxKcal > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/40"
            style={{ bottom: `${(kcalTarget / maxKcal) * 96}px` }}
          >
            <span className="absolute -top-2.5 right-0 bg-card px-1 text-[9px] font-medium text-muted-foreground">
              target
            </span>
          </div>
        )}
        <div className="flex h-full items-end gap-1">
          {summary.days.map((d) => {
            const h = maxKcal > 0 ? Math.max(2, (d.kcal / maxKcal) * 96) : 2;
            const onTarget =
              kcalTarget > 0 &&
              d.hasEntries &&
              Math.abs(d.kcal - kcalTarget) / kcalTarget <= 0.1;
            const status = !d.hasEntries
              ? 'no entries'
              : onTarget
                ? 'on target'
                : d.kcal > kcalTarget
                  ? 'over target'
                  : 'under target';
            return (
              <div
                key={d.date}
                className="h-full flex-1 rounded-t-sm transition-colors"
                style={{
                  height: `${h}px`,
                  backgroundColor: onTarget
                    ? 'hsl(var(--primary))'
                    : d.hasEntries
                      ? 'hsl(var(--kcal))'
                      : 'hsl(var(--muted))',
                }}
                title={`${d.date} - ${formatKcal(d.kcal)} kcal (${status})`}
              />
            );
          })}
        </div>
      </div>

      {range <= 7 && (
        <div className="mt-1 flex gap-1">
          {summary.days.map((d) => (
            <div
              key={d.date}
              className="flex-1 text-center text-[10px] text-muted-foreground"
            >
              {format(fromLocalDate(d.date), 'EEEEE')}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <LegendKey color="hsl(var(--primary))" label="On target (±10%)" />
        <LegendKey color="hsl(var(--kcal))" label="Over / under" />
        <LegendKey color="hsl(var(--muted))" label="No entries" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-3.5 border-t border-dashed border-foreground/50" />
          Daily target
        </span>
      </div>
    </>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
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
