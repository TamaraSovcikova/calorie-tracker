import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { createExercise, softDeleteExercise } from '@/db/repos/exercise';
import { useProfile } from '@/db/repos/profile';
import { db } from '@/db/dexie';
import type { ExerciseEntry } from '@/db/types';
import type { LocalDate } from '@/lib/dates';
import {
  ACTIVITIES,
  DEFAULT_WEIGHT_KG,
  estimateActivityKcal,
} from './activities';

interface ExerciseSheetProps {
  open: boolean;
  date: LocalDate;
  /** Pass an existing entry to edit; undefined for create. */
  entry?: ExerciseEntry;
  onClose: () => void;
}

export function ExerciseSheet({ open, date, entry, onClose }: ExerciseSheetProps) {
  const profile = useProfile();
  const weightKg = profile?.weight_kg ?? DEFAULT_WEIGHT_KG;

  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [kcal, setKcal] = useState('');
  /** MET of the picked activity — drives the calorie estimate. */
  const [met, setMet] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate when editing / reset when creating.
  useEffect(() => {
    if (!open) return;
    setMet(null);
    setShowSuggestions(false);
    if (entry) {
      setName(entry.name);
      setDuration(entry.duration_min ? String(entry.duration_min) : '');
      setKcal(String(entry.kcal_burned));
    } else {
      setName('');
      setDuration('');
      setKcal('');
    }
  }, [open, entry]);

  // With an activity picked, the calorie estimate follows the duration.
  useEffect(() => {
    if (met === null) return;
    const d = parseFloat(duration);
    if (Number.isFinite(d) && d > 0) {
      setKcal(String(Math.round(estimateActivityKcal(met, weightKg, d))));
    }
  }, [met, duration, weightKg]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    const list = q
      ? ACTIVITIES.filter((a) => a.name.toLowerCase().includes(q))
      : ACTIVITIES;
    return list.slice(0, 8);
  }, [name]);

  const pickActivity = (activityName: string, activityMet: number) => {
    setName(activityName);
    setMet(activityMet);
    setShowSuggestions(false);
  };

  const valid =
    name.trim().length > 0 &&
    Number.isFinite(parseFloat(kcal)) &&
    parseFloat(kcal) >= 0;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const kcalNum = parseFloat(kcal);
      const durNum = duration ? parseFloat(duration) : undefined;
      const durationMin =
        durNum !== undefined && Number.isFinite(durNum) ? durNum : undefined;
      if (entry) {
        // Renaming a Fitbit row locks the name so re-syncs preserve it
        // instead of reverting to the source's generic label.
        const renamed = name.trim() !== entry.name;
        await db.exercise_entries.update(entry.id, {
          name: name.trim(),
          duration_min: durationMin,
          kcal_burned: kcalNum,
          ...(entry.source === 'fitbit' && renamed
            ? { name_locked: true }
            : {}),
          updated_at: new Date().toISOString(),
        });
      } else {
        await createExercise({
          date,
          name: name.trim(),
          duration_min: durationMin,
          kcal_burned: kcalNum,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    await softDeleteExercise(entry.id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? 'Edit exercise' : 'Log exercise'}
      trailing={
        entry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            aria-label="Delete exercise"
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )
      }
    >
      <div className="flex flex-col">
        <div className="space-y-3 p-4">
          <div className="relative">
            <LabeledInput
              label="Activity"
              placeholder="Search activities, or type your own"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setMet(null);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              autoFocus={!entry}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg">
                {suggestions.map((a) => (
                  <li key={a.name}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickActivity(a.name, a.met)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>{a.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.met} MET
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="Duration"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              trailing="min"
            />
            <LabeledInput
              label="Calories burned"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={kcal}
              onChange={(e) => {
                setKcal(e.target.value);
                setMet(null); // a manual edit drops the auto-estimate
              }}
              trailing="kcal"
            />
          </div>
          {met !== null ? (
            <p className="text-xs text-muted-foreground">
              Estimated from a {Math.round(weightKg)} kg body weight
              {profile?.weight_kg ? '' : ' (set yours in Settings for accuracy)'}
              . Enter a duration to fill the estimate, or edit calories
              directly.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pick an activity above for an automatic calorie estimate, or
              enter calories yourself. Health data syncs automatically when
              connected.
            </p>
          )}
        </div>
        <div className="border-t border-border bg-card p-4">
          <Button
            type="button"
            variant="primary"
            block
            onClick={handleSave}
            disabled={!valid || saving}
          >
            {saving ? 'Saving…' : entry ? 'Save changes' : 'Log exercise'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
