import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { QuantityStep } from './QuantityStep';
import { computeMacros, type QuantityMode, type QuantityState } from './foodMath';
import { softDeleteDiaryEntry, updateDiaryEntry } from '@/db/repos/diary';
import { getFood } from '@/db/repos/foods';
import { LogMealStep } from '@/features/meals/LogMealStep';
import { useMealResolved } from '@/features/meals/useMealResolved';
import { multiplyTotals } from '@/features/meals/mealMath';
import type { DiaryEntry, Food } from '@/db/types';

interface EditEntrySheetProps {
  open: boolean;
  entry: DiaryEntry | null;
  onClose: () => void;
}

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
  if (!entry) {
    return <Sheet open={open} onClose={onClose} title="Edit entry"><div /></Sheet>;
  }
  return entry.kind === 'meal' ? (
    <EditMealEntryInner entry={entry} open={open} onClose={onClose} />
  ) : (
    <EditFoodEntryInner entry={entry} open={open} onClose={onClose} />
  );
}

function EditFoodEntryInner({
  entry,
  open,
  onClose,
}: {
  entry: DiaryEntry;
  open: boolean;
  onClose: () => void;
}) {
  const [food, setFood] = useState<Food | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!entry.food_id) {
      setFood(undefined);
      return;
    }
    void getFood(entry.food_id).then((f) => {
      if (!cancelled) setFood(f);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.food_id]);

  const handleSave = async (state: QuantityState) => {
    if (!food) return;
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
    await softDeleteDiaryEntry(entry.id);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit entry">
      {food ? (
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

function EditMealEntryInner({
  entry,
  open,
  onClose,
}: {
  entry: DiaryEntry;
  open: boolean;
  onClose: () => void;
}) {
  const resolved = useMealResolved(entry.meal_id);

  const handleSave = async (multiplier: number) => {
    if (!resolved) return;
    const totals = multiplyTotals(resolved.totals, multiplier);
    await updateDiaryEntry(entry.id, {
      qty: multiplier,
      unit: 'serving',
      portion_multiplier: multiplier,
      kcal: totals.kcal,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
    });
    onClose();
  };

  const handleDelete = async () => {
    await softDeleteDiaryEntry(entry.id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit meal entry"
      trailing={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          aria-label="Delete entry"
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
      {entry.meal_id && resolved !== null ? (
        <LogMealStep
          mealId={entry.meal_id}
          initialMultiplier={entry.portion_multiplier ?? 1}
          onBack={onClose}
          onSave={handleSave}
        />
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {resolved === null ? 'This meal has been deleted.' : 'Loading…'}
        </div>
      )}
    </Sheet>
  );
}
