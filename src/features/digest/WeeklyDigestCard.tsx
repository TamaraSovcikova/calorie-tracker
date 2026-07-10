import { Sparkles, X } from 'lucide-react';
import { usePet } from '@/db/repos/pet';
import { formatKcal } from '@/lib/macros';
import { useWeeklyDigest, type WeeklyDigest } from './weeklyDigest';

/** A once-a-week recap card, shown on the diary and dismissed per week. */
export function WeeklyDigestCard() {
  const { digest, dismiss } = useWeeklyDigest();
  const pet = usePet();
  if (!digest) return null;
  const name = pet?.name ?? 'Biscuit';

  return (
    <section className="relative rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="tap-target absolute right-1.5 top-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Your week with {name}
      </div>
      <div className="text-xs text-muted-foreground">{digest.weekLabel}</div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Days logged" value={`${digest.daysLogged} / 7`} />
        <Stat label="Average / day" value={`${formatKcal(digest.avgKcal)} kcal`} />
        <Stat
          label="On target"
          value={`${digest.daysOnTarget} day${digest.daysOnTarget === 1 ? '' : 's'}`}
        />
        {digest.totalBurned > 0 && (
          <Stat label="Burned" value={`${formatKcal(digest.totalBurned)} kcal`} />
        )}
        {digest.weightChange !== null && (
          <Stat
            label="Weight"
            value={`${digest.weightChange >= 0 ? '+' : ''}${digest.weightChange.toFixed(1)} ${digest.weightUnit}`}
          />
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{encouragement(digest, name)}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function encouragement(d: WeeklyDigest, name: string): string {
  if (d.daysLogged >= 7) return `A perfect week of logging - ${name} is thriving!`;
  if (d.daysLogged >= 5) return `A strong week - ${name} is happy. Keep it going!`;
  if (d.daysLogged >= 3) return `A decent week. A little more consistency and ${name} will be thriving.`;
  return `${name} missed you - try to log a little more this week.`;
}
