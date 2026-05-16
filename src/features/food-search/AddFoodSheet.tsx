import { lazy, Suspense, useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { FoodSearchPanel } from './FoodSearchPanel';
import { QuantityStep } from './QuantityStep';
import { ManualEntryForm } from './ManualEntryForm';

// ZXing is ~600 kB; only load it when the user opens the Scan tab.
const BarcodeScanner = lazy(() =>
  import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
);
import { computeMacros, type QuantityState } from './foodMath';
import { createDiaryEntry } from '@/db/repos/diary';
import { db } from '@/db/dexie';
import { lookupBarcode, OffRateLimitError } from '@/lib/off-api';
import { MealPicker } from '@/features/meals/MealPicker';
import { LogMealStep } from '@/features/meals/LogMealStep';
import { multiplyTotals } from '@/features/meals/mealMath';
import { useMealResolved } from '@/features/meals/useMealResolved';
import type { LocalDate } from '@/lib/dates';
import type { Food, Meal, MealSection } from '@/db/types';

interface AddFoodSheetProps {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  section: MealSection;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'quantity'; food: Food }
  | { kind: 'meal-portion'; meal: Meal }
  | { kind: 'manual'; presetName?: string; presetBarcode?: string };

type Tab = 'search' | 'scan' | 'meals';

export function AddFoodSheet({ open, onClose, date, section }: AddFoodSheetProps) {
  const [tab, setTab] = useState<Tab>('search');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [scanError, setScanError] = useState<string | null>(null);

  const reset = () => {
    setStep({ kind: 'pick' });
    setTab('search');
    setScanError(null);
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const handlePick = (food: Food) => setStep({ kind: 'quantity', food });
  const handleManualEntry = (name: string) =>
    setStep({ kind: 'manual', presetName: name || undefined });
  const handleManualCreated = (food: Food) =>
    setStep({ kind: 'quantity', food });
  const handlePickMeal = (meal: Meal) =>
    setStep({ kind: 'meal-portion', meal });

  const handleSaveQuantity = async (state: QuantityState) => {
    if (step.kind !== 'quantity') return;
    const macros = computeMacros(step.food, state);
    if (macros.grams <= 0) return;
    await createDiaryEntry({
      date,
      section,
      kind: 'food',
      food_id: step.food.id,
      qty: state.qty,
      unit: macros.unit,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    });
    handleClose();
  };

  // Stable identity — BarcodeScanner has this in its camera-effect deps,
  // so a fresh closure each render would tear down and re-acquire the
  // camera stream (flicker). Only stable setState calls are referenced.
  const handleBarcode = useCallback(async (code: string) => {
    setScanError(null);
    setStep({ kind: 'looking-up', barcode: code });
    try {
      const food = await lookupBarcode(code);
      if (food) {
        await db.foods.put(food);
        setStep({ kind: 'quantity', food });
        return;
      }
      setStep({ kind: 'manual', presetBarcode: code });
    } catch (err) {
      if (err instanceof OffRateLimitError) {
        setScanError(
          `Open Food Facts rate limit hit. Try again in ${Math.ceil(err.retryAfterMs / 1000)}s, or add it manually.`,
        );
      } else {
        setScanError(
          err instanceof Error ? err.message : 'Lookup failed. Try again or add manually.',
        );
      }
      setStep({ kind: 'manual', presetBarcode: code });
    }
  }, []);

  let title: string;
  let content: React.ReactNode;
  if (step.kind === 'pick') {
    title = 'Add food';
    content = (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-3">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'search', label: 'Search' },
              { value: 'scan', label: 'Scan' },
              { value: 'meals', label: 'Meals' },
            ]}
          />
        </div>
        {tab === 'search' && (
          <FoodSearchPanel
            section={section}
            onPick={handlePick}
            onManualEntry={handleManualEntry}
          />
        )}
        {tab === 'scan' && (
          <>
            {scanError && (
              <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {scanError}
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <BarcodeScanner onCode={handleBarcode} />
            </Suspense>
          </>
        )}
        {tab === 'meals' && <MealPicker onPick={handlePickMeal} />}
      </div>
    );
  } else if (step.kind === 'looking-up') {
    title = 'Looking up…';
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-sm">
          Searching Open Food Facts for{' '}
          <span className="font-mono">{step.barcode}</span>
        </div>
      </div>
    );
  } else if (step.kind === 'quantity') {
    title = 'Add quantity';
    content = (
      <QuantityStep
        food={step.food}
        onBack={() => setStep({ kind: 'pick' })}
        onSave={handleSaveQuantity}
      />
    );
  } else if (step.kind === 'meal-portion') {
    title = 'Log meal';
    content = (
      <MealPortionStep
        meal={step.meal}
        date={date}
        section={section}
        onBack={() => setStep({ kind: 'pick' })}
        onDone={handleClose}
      />
    );
  } else {
    title = 'New product';
    content = (
      <ManualEntryForm
        initialName={step.presetName}
        initialBarcode={step.presetBarcode}
        onBack={() => setStep({ kind: 'pick' })}
        onCreated={handleManualCreated}
      />
    );
  }

  return (
    <Sheet open={open} onClose={handleClose} title={title}>
      {content}
    </Sheet>
  );
}

/**
 * Inner component so the useMealResolved hook only runs when actually
 * showing the meal-portion step. Saves the diary entry with the meal's
 * totals scaled by the chosen multiplier.
 */
function MealPortionStep({
  meal,
  date,
  section,
  onBack,
  onDone,
}: {
  meal: Meal;
  date: LocalDate;
  section: MealSection;
  onBack: () => void;
  onDone: () => void;
}) {
  const resolved = useMealResolved(meal.id);
  const handleSave = async (multiplier: number) => {
    if (!resolved) return;
    const totals = multiplyTotals(resolved.totals, multiplier);
    await createDiaryEntry({
      date,
      section,
      kind: 'meal',
      meal_id: meal.id,
      qty: multiplier,
      unit: 'serving',
      portion_multiplier: multiplier,
      kcal: totals.kcal,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
    });
    onDone();
  };
  return <LogMealStep mealId={meal.id} onBack={onBack} onSave={handleSave} />;
}
