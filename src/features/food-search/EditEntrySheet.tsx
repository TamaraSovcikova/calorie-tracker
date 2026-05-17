import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { QuantityStep } from './QuantityStep';
import { QuickAddForm, type QuickAddValues } from './QuickAddForm';
import type { QuantityMode, QuantityState, ResolvedMacros } from './foodMath';
import { restoreDiaryEntry, softDeleteDiaryEntry, updateDiaryEntry } from '@/db/repos/diary';
import { toast } from '@/components/ui/toast';
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
  if (entry.kind === 'meal') {
    return <EditMealEntryInner entry={entry} open={open} onClose={onClose} />;
  }
  if (entry.kind === 'quick') {
    return <EditQuickEntryInner entry={entry} open={open} onClose={onClose} />;
  }
  return <EditFoodEntryInner entry={entry} open={open} onClose={onClose} />;
}

function EditQuickEntryInner({
  entry,
  open,
  onClose,
}: {
  entry: DiaryEntry;
  open: boolean;
  onClose: () => void;
}) {
  const handleSave = async (v: QuickAddValues) => {
    await updateDiaryEntry(entry.id, {
      kcal: v.kcal,
      protein: v.protein,
      carbs: v.carbs,
      fat: v.fat,
    });
    onClose();
  };

  const handleDelete = async () => {
    const id = entry.id;
    await softDeleteDiaryEntry(id);
    onClose();
    toast({
      message: 'Entry removed',
      action: { label: 'Undo', onClick: () => void restoreDiaryEntry(id) },
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit quick add">
      <QuickAddForm
        initial={{
          kcal: entry.kcal,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
        }}
        saveLabel="Save changes"
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </Sheet>
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

  const handleSave = async (state: QuantityState, macros: ResolvedMacros) => {
    if (!food) return;
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
    const id = entry.id;
    await softDeleteDiaryEntry(id);
    onClose();
    toast({
      message: 'Entry removed',
      action: { label: 'Undo', onClick: () => void restoreDiaryEntry(id) },
    });
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
    const id = entry.id;
    await softDeleteDiaryEntry(id);
    onClose();
    toast({
      message: 'Entry removed',
      action: { label: 'Undo', onClick: () => void restoreDiaryEntry(id) },
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit meal entry">
      {entry.meal_id && resolved !== null ? (
        <LogMealStep
          mealId={entry.meal_id}
          initialMultiplier={entry.portion_multiplier ?? 1}
          saveLabel="Save changes"
          onBack={onClose}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {resolved === null ? 'This meal has been deleted.' : 'Loading…'}
        </div>
      )}
    </Sheet>
  );
}
