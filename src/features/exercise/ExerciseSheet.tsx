import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import {
  createExercise,
  softDeleteExercise,
} from '@/db/repos/exercise';
import { db } from '@/db/dexie';
import type { ExerciseEntry } from '@/db/types';
import type { LocalDate } from '@/lib/dates';

interface ExerciseSheetProps {
  open: boolean;
  date: LocalDate;
  /** Pass an existing entry to edit; undefined for create. */
  entry?: ExerciseEntry;
  onClose: () => void;
}

export function ExerciseSheet({ open, date, entry, onClose }: ExerciseSheetProps) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [kcal, setKcal] = useState('');
  const [saving, setSaving] = useState(false);

  // Hydrate when editing.
  useEffect(() => {
    if (!open) return;
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
      if (entry) {
        await db.exercise_entries.update(entry.id, {
          name: name.trim(),
          duration_min:
            durNum !== undefined && Number.isFinite(durNum) ? durNum : undefined,
          kcal_burned: kcalNum,
          updated_at: new Date().toISOString(),
        });
      } else {
        await createExercise({
          date,
          name: name.trim(),
          duration_min:
            durNum !== undefined && Number.isFinite(durNum) ? durNum : undefined,
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
          <LabeledInput
            label="Activity"
            placeholder="e.g. Run, weights, cycling"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="Duration (optional)"
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
              onChange={(e) => setKcal(e.target.value)}
              trailing="kcal"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Health data syncs automatically when connected. Use this to
            log workouts manually, or to record a burn from another source.
          </p>
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
