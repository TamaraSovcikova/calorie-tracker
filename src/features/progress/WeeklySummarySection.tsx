import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useWeeklySummary } from './useWeeklySummary';
import { fromLocalDate } from '@/lib/dates';
import { formatKcal } from '@/lib/macros';
import type { Profile } from '@/db/types';

interface WeeklySummarySectionProps {
  profile: Profile;
}

export function WeeklySummarySection({ profile }: WeeklySummarySectionProps) {
  const summary = useWeeklySummary(profile.kcal_target);

  if (!summary) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const maxKcal = Math.max(profile.kcal_target, ...summary.days.map((d) => d.kcal));

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Last 7 days
        </h2>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Avg kcal" value={formatKcal(summary.avgKcal)} />
        <Stat label="Avg protein" value={`${Math.round(summary.avgProtein)} g`} />
        <Stat
          label="Days on target"
          value={`${summary.daysHitTarget}/7`}
          hint="±10% of kcal target"
        />
      </div>

      <div className="mt-4 flex h-24 items-end gap-1">
        {summary.days.map((d) => {
          const h = maxKcal > 0 ? Math.max(2, (d.kcal / maxKcal) * 96) : 2;
          const onTarget =
            profile.kcal_target > 0 &&
            d.hasEntries &&
            Math.abs(d.kcal - profile.kcal_target) / profile.kcal_target <= 0.1;
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
              <div className="text-[10px] text-muted-foreground">
                {format(fromLocalDate(d.date), 'EEEEE')}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
