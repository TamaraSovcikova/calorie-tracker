import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { FoodSearchPanel } from '@/features/food-search/FoodSearchPanel';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import { LogMealStep } from '@/features/meals/LogMealStep';
import { useMealResolved } from '@/features/meals/useMealResolved';
import { multiplyTotals } from '@/features/meals/mealMath';
import type { QuantityState, ResolvedMacros } from '@/features/food-search/foodMath';
import type { Food, Meal } from '@/db/types';

/** What the picker hands back: enough to state the amount AND to log the
 *  thing later with one tap on the day. */
export interface PickedItem {
  kcal: number;
  label: string;
  food_id?: string;
  meal_id?: string;
  qty?: number;
  unit?: string;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'quantity'; food: Food }
  | { kind: 'portion'; meal: Meal };

/** The meal branch needs the meal's resolved totals to turn a portion
 *  multiplier into kcal, and that is a hook, so it lives in its own leaf. */
function MealPortion({
  meal,
  onBack,
  onPick,
}: {
  meal: Meal;
  onBack: () => void;
  onPick: (item: PickedItem) => void;
}) {
  const resolved = useMealResolved(meal.id);
  return (
    <LogMealStep
      mealId={meal.id}
      onBack={onBack}
      saveLabel="Reserve this"
      notice="Reserving a meal sets the calories aside. You can log it with one tap on the day."
      onSave={(multiplier) => {
        if (!resolved) return;
        const totals = multiplyTotals(resolved.totals, multiplier);
        onPick({
          kcal: totals.kcal,
          label: meal.name,
          meal_id: meal.id,
          qty: multiplier,
          unit: 'serving',
        });
      }}
    />
  );
}

/**
 * Pick the actual thing you want to eat, rather than guessing its calories.
 *
 * Reuses the search panel and portion steps the diary already uses, so the
 * matcher, the typo tolerance and the portion units are the same ones
 * everywhere else - a reservation for "1 slice" means what it means in the
 * diary.
 */
export function ReserveItemPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: PickedItem) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });

  const close = () => {
    setStep({ kind: 'pick' });
    onClose();
  };

  const take = (item: PickedItem) => {
    onPick(item);
    close();
  };

  const saveFood = (food: Food) => (state: QuantityState, macros: ResolvedMacros) => {
    if (macros.grams <= 0) return;
    take({
      kcal: macros.kcal,
      label: food.name,
      food_id: food.id,
      qty: state.qty,
      unit: macros.unit,
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={
        step.kind === 'pick' ? (
          'What are you saving for?'
        ) : (
          <button
            type="button"
            onClick={() => setStep({ kind: 'pick' })}
            className="flex items-center gap-1.5 text-base font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )
      }
    >
      {step.kind === 'pick' && (
        <FoodSearchPanel
          section="snacks"
          onPick={(food) => setStep({ kind: 'quantity', food })}
          onPickMeal={(meal) => setStep({ kind: 'portion', meal })}
          onManualEntry={() => close()}
        />
      )}
      {step.kind === 'quantity' && (
        <QuantityStep
          food={step.food}
          saveLabel="Reserve this"
          onBack={() => setStep({ kind: 'pick' })}
          onSave={saveFood(step.food)}
        />
      )}
      {step.kind === 'portion' && (
        <MealPortion
          meal={step.meal}
          onBack={() => setStep({ kind: 'pick' })}
          onPick={take}
        />
      )}
    </Sheet>
  );
}
