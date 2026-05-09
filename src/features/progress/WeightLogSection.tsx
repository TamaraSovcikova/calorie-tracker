import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { MiniChart, type ChartPoint } from './MiniChart';
import { deleteWeight, logWeight, useWeightLog } from '@/db/repos/weight';
import { fromLocalDate, todayLocal } from '@/lib/dates';
import { kgToLb, lbToKg } from '@/lib/units';
import type { Profile } from '@/db/types';

const RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, ALL: Infinity };
type RangeKey = keyof typeof RANGE_DAYS;

interface WeightLogSectionProps {
  profile: Profile;
}

export function WeightLogSection({ profile }: WeightLogSectionProps) {
  const log = useWeightLog();
  const isImperial = profile.units === 'imperial';
  const unit = isImperial ? 'lb' : 'kg';
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<RangeKey>('3M');

  const points: ChartPoint[] = useMemo(() => {
    if (!log) return [];
    const cutoff = Date.now() - RANGE_DAYS[range] * 86400000;
    const filtered = log.filter((w) => fromLocalDate(w.date).getTime() >= cutoff);
    // Compute 7-day moving average over the filtered slice
    const avg: number[] = [];
    for (let i = 0; i < filtered.length; i++) {
      const start = Math.max(0, i - 6);
      const slice = filtered.slice(start, i + 1);
      avg.push(slice.reduce((s, w) => s + w.weight_kg, 0) / slice.length);
    }
    return filtered.map((w, i) => ({
      x: fromLocalDate(w.date).getTime(),
      y: isImperial ? kgToLb(w.weight_kg) : w.weight_kg,
      yAvg: isImperial ? kgToLb(avg[i]) : avg[i],
    }));
  }, [log, range, isImperial]);

  const handleSave = async () => {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) return;
    setSaving(true);
    try {
      await logWeight(date, isImperial ? lbToKg(num) : num);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  const recent = log ? [...log].slice(-5).reverse() : [];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Scale className="h-4 w-4 text-muted-foreground" />
          Weight log
        </h2>
      </header>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <LabeledInput
          label="Today's weight"
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          trailing={unit}
        />
        <LabeledInput
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button
          size="md"
          variant="primary"
          onClick={handleSave}
          disabled={saving || !value}
        >
          Log
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {(Object.keys(RANGE_DAYS) as RangeKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setRange(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              range === k
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <MiniChart
          points={points}
          colorVar="primary"
          formatX={(ms) => format(ms, 'd MMM')}
          formatY={(n) => `${n.toFixed(1)}${unit}`}
        />
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {recent.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground tabular-nums">{w.date}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">
                    {(isImperial ? kgToLb(w.weight_kg) : w.weight_kg).toFixed(1)} {unit}
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteWeight(w.id)}
                    aria-label="Delete weighing"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
