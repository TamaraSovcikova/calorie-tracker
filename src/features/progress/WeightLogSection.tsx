import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { RangePills } from '@/components/ui/RangePills';
import { MiniChart, type ChartPoint } from './MiniChart';
import { deleteWeight, logWeight, useWeightLog } from '@/db/repos/weight';
import { updateProfile } from '@/db/repos/profile';
import { toast } from '@/components/ui/toast';
import { fromLocalDate, todayLocal } from '@/lib/dates';
import { kgToLb, lbToKg } from '@/lib/units';
import type { Profile } from '@/db/types';

const RANGE_DAYS = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, ALL: Infinity };
type RangeKey = keyof typeof RANGE_DAYS;

/** Weigh-ins shown before the list collapses behind "View all". */
const RECENT_COUNT = 5;

interface WeightLogSectionProps {
  profile: Profile;
}

type Projection =
  | { state: 'reached' }
  | { state: 'off-track' }
  | { state: 'on-track'; etaMs: number };

/**
 * Estimate when the weight trend reaches the goal, from the slope of the
 * 7-day moving average across the visible range. Returns null when there's
 * too little data to draw a line through.
 */
function projectGoal(points: ChartPoint[], goal: number): Projection | null {
  const avg = points.filter((p) => p.yAvg !== undefined);
  if (avg.length < 2) return null;
  const first = avg[0];
  const last = avg[avg.length - 1];
  const dxMs = last.x - first.x;
  if (dxMs <= 0) return null;
  const remaining = goal - last.yAvg!;
  if (Math.abs(remaining) < 0.1) return { state: 'reached' };
  const slopePerMs = (last.yAvg! - first.yAvg!) / dxMs;
  if (
    Math.abs(slopePerMs) < 1e-13 ||
    Math.sign(slopePerMs) !== Math.sign(remaining)
  ) {
    return { state: 'off-track' };
  }
  return { state: 'on-track', etaMs: last.x + remaining / slopePerMs };
}

export function WeightLogSection({ profile }: WeightLogSectionProps) {
  const log = useWeightLog();
  const isImperial = profile.units === 'imperial';
  const unit = isImperial ? 'lb' : 'kg';
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<RangeKey>('3M');
  const [showAll, setShowAll] = useState(false);
  const [goalInput, setGoalInput] = useState(() =>
    profile.goal_weight_kg != null
      ? (isImperial
          ? kgToLb(profile.goal_weight_kg)
          : profile.goal_weight_kg
        ).toFixed(1)
      : '',
  );

  const commitGoal = () => {
    const trimmed = goalInput.trim();
    if (!trimmed) {
      void updateProfile({ goal_weight_kg: undefined });
      return;
    }
    const num = parseFloat(trimmed);
    if (!Number.isFinite(num) || num <= 0) return;
    void updateProfile({ goal_weight_kg: isImperial ? lbToKg(num) : num });
  };

  const goalDisplay =
    profile.goal_weight_kg != null
      ? isImperial
        ? kgToLb(profile.goal_weight_kg)
        : profile.goal_weight_kg
      : undefined;

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
      toast({ message: 'Weight logged', variant: 'success' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (w: { id: string; date: string; weight_kg: number; note?: string }) => {
    await deleteWeight(w.id);
    toast({
      message: 'Weigh-in removed',
      action: {
        label: 'Undo',
        onClick: () => void logWeight(w.date, w.weight_kg, w.note),
      },
    });
  };

  const allEntries = log ? [...log].reverse() : [];
  const recent = showAll ? allEntries : allEntries.slice(0, RECENT_COUNT);
  const projection = goalDisplay != null ? projectGoal(points, goalDisplay) : null;

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

      <RangePills<RangeKey>
        label="Weight range"
        className="mt-4"
        value={range}
        onChange={setRange}
        options={(Object.keys(RANGE_DAYS) as RangeKey[]).map((k) => ({
          value: k,
          label: k,
        }))}
      />

      <div className="mt-3 w-36">
        <LabeledInput
          label="Goal weight"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          onBlur={commitGoal}
          trailing={unit}
        />
      </div>

      <div className="mt-3">
        <MiniChart
          points={points}
          colorVar="primary"
          target={goalDisplay}
          formatX={(ms) => format(ms, 'd MMM')}
          formatY={(n) => `${n.toFixed(1)}${unit}`}
        />
      </div>
      {goalDisplay != null && projection && (
        <p className="mt-2 text-xs text-muted-foreground">
          {projection.state === 'reached'
            ? `You're at your ${goalInput} ${unit} goal.`
            : projection.state === 'off-track'
              ? `Weight isn't trending toward your ${goalInput} ${unit} goal yet.`
              : `On track to reach ${goalInput} ${unit} around ${format(projection.etaMs, 'MMM yyyy')}.`}
        </p>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {showAll ? `All weigh-ins (${allEntries.length})` : 'Recent'}
            </h3>
            {allEntries.length > RECENT_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="tap-target -mr-2 px-2 text-xs font-medium text-primary hover:underline"
              >
                {showAll ? 'Show less' : `View all (${allEntries.length})`}
              </button>
            )}
          </div>
          {/* Capped height once expanded so a long history scrolls inside
              the card instead of pushing the rest of the page away. */}
          <ul
            className={`mt-2 divide-y divide-border ${
              showAll ? 'max-h-80 overflow-y-auto pr-1' : ''
            }`}
          >
            {recent.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted-foreground tabular-nums">{w.date}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">
                    {(isImperial ? kgToLb(w.weight_kg) : w.weight_kg).toFixed(1)} {unit}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(w)}
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
