import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { FoodSearchPanel } from '@/features/food-search/FoodSearchPanel';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import { ManualEntryForm } from '@/features/food-search/ManualEntryForm';
import { Loader2 } from 'lucide-react';
import { computeMacros, type QuantityState } from '@/features/food-search/foodMath';
import { enrichUsdaFoodWithPortions } from '@/lib/usda-api';
import { db } from '@/db/dexie';
import type { Food } from '@/db/types';
import type { MealItemInput } from '@/db/repos/meals';

interface IngredientPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called once with the new ingredient input — caller appends to the meal. */
  onPicked: (item: MealItemInput, food: Food) => void;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'loading-food' }
  | { kind: 'quantity'; food: Food }
  | { kind: 'manual'; presetName?: string };

export function IngredientPickerSheet({
  open,
  onClose,
  onPicked,
}: IngredientPickerSheetProps) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });

  const reset = () => setStep({ kind: 'pick' });
  const handleClose = () => {
    onClose();
    reset();
  };

  const handlePick = async (food: Food) => {
    if (food.source === 'usda' && food.custom_units.length === 0) {
      setStep({ kind: 'loading-food' });
      const enriched = await enrichUsdaFoodWithPortions(food);
      await db.foods.put(enriched).catch(() => undefined);
      setStep({ kind: 'quantity', food: enriched });
      return;
    }
    setStep({ kind: 'quantity', food });
  };
  const handleManualEntry = (name: string) =>
    setStep({ kind: 'manual', presetName: name || undefined });
  const handleManualCreated = (food: Food) =>
    setStep({ kind: 'quantity', food });

  const handleSave = (state: QuantityState) => {
    if (step.kind !== 'quantity') return;
    const macros = computeMacros(step.food, state);
    if (macros.grams <= 0) return;
    onPicked(
      { food_id: step.food.id, qty: state.qty, unit: macros.unit },
      step.food,
    );
    handleClose();
  };

  let title: string;
  let content: React.ReactNode;
  if (step.kind === 'pick') {
    title = 'Add ingredient';
    content = (
      <FoodSearchPanel
        section="snacks"
        onPick={handlePick}
        onManualEntry={handleManualEntry}
      />
    );
  } else if (step.kind === 'loading-food') {
    title = 'Loading…';
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          Fetching portion sizes…
        </div>
      </div>
    );
  } else if (step.kind === 'quantity') {
    title = step.food.name;
    content = (
      <QuantityStep
        food={step.food}
        saveLabel="Add ingredient"
        onBack={() => setStep({ kind: 'pick' })}
        onSave={handleSave}
      />
    );
  } else {
    title = 'New product';
    content = (
      <ManualEntryForm
        initialName={step.presetName}
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
