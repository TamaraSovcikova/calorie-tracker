import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { FoodSearchPanel } from '@/features/food-search/FoodSearchPanel';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import { ManualEntryForm } from '@/features/food-search/ManualEntryForm';
import { computeMacros, type QuantityState } from '@/features/food-search/foodMath';
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

  const handlePick = (food: Food) => setStep({ kind: 'quantity', food });
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
