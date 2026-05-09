import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { FoodSearchPanel } from './FoodSearchPanel';
import { QuantityStep } from './QuantityStep';
import { ManualEntryForm } from './ManualEntryForm';
import { computeMacros, type QuantityState } from './foodMath';
import { createDiaryEntry } from '@/db/repos/diary';
import type { LocalDate } from '@/lib/dates';
import type { Food, MealSection } from '@/db/types';

interface AddFoodSheetProps {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  section: MealSection;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'quantity'; food: Food }
  | { kind: 'manual'; presetName?: string };

type Tab = 'search' | 'scan' | 'meals';

export function AddFoodSheet({ open, onClose, date, section }: AddFoodSheetProps) {
  const [tab, setTab] = useState<Tab>('search');
  const [step, setStep] = useState<Step>({ kind: 'pick' });

  const reset = () => {
    setStep({ kind: 'pick' });
    setTab('search');
  };

  const handleClose = () => {
    onClose();
    // small UX detail — don't reset until the close animation has run, but
    // since we have no animation, reset immediately
    reset();
  };

  const handlePick = (food: Food) => setStep({ kind: 'quantity', food });
  const handleManualEntry = (name: string) =>
    setStep({ kind: 'manual', presetName: name || undefined });
  const handleManualCreated = (food: Food) =>
    setStep({ kind: 'quantity', food });

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

  // Title + content vary by step.
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
          <div className="p-8 text-center text-sm text-muted-foreground">
            Barcode scanning comes online in Phase 5.
          </div>
        )}
        {tab === 'meals' && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Saved meals come online in Phase 6.
          </div>
        )}
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
