import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { QuantityStep } from './QuantityStep';
import { computeMacros, type QuantityMode, type QuantityState } from './foodMath';
import { softDeleteDiaryEntry, updateDiaryEntry } from '@/db/repos/diary';
import { getFood } from '@/db/repos/foods';
import type { DiaryEntry, Food } from '@/db/types';

interface EditEntrySheetProps {
  open: boolean;
  entry: DiaryEntry | null;
  onClose: () => void;
}

/** Reverse-engineer the QuantityState from the persisted entry. */
function entryToQuantity(entry: DiaryEntry): QuantityState {
  if (entry.unit === 'g' || entry.unit === 'ml') {
    return { mode: 'g', qty: entry.qty };
  }
  if (entry.unit === 'serving') {
    return { mode: 'serving', qty: entry.qty };
  }
  return { mode: `unit:${entry.unit}` as QuantityMode, qty: entry.qty };
}

export function EditEntrySheet({ open, entry, onClose }: EditEntrySheetProps) {
  const [food, setFood] = useState<Food | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!entry || entry.kind !== 'food' || !entry.food_id) {
      setFood(undefined);
      return;
    }
    void getFood(entry.food_id).then((f) => {
      if (!cancelled) setFood(f);
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const handleSave = async (state: QuantityState) => {
    if (!entry || !food) return;
    const macros = computeMacros(food, state);
    if (macros.grams <= 0) return;
    await updateDiaryEntry(entry.id, {
      qty: state.qty,
      unit: macros.unit,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!entry) return;
    await softDeleteDiaryEntry(entry.id);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit entry">
      {entry && food ? (
        <QuantityStep
          food={food}
          initial={entryToQuantity(entry)}
          saveLabel="Save changes"
          onBack={onClose}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      )}
    </Sheet>
  );
}
