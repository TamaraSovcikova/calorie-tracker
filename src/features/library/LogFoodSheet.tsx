import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Select } from '@/components/ui/Select';
import { LabeledInput } from '@/components/ui/Input';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import type { QuantityState, ResolvedMacros } from '@/features/food-search/foodMath';
import { createDiaryEntry } from '@/db/repos/diary';
import { toast } from '@/components/ui/toast';
import { formatDayHeader, todayLocal } from '@/lib/dates';
import {
  MEAL_SECTIONS,
  MEAL_SECTION_LABELS,
  type Food,
  type MealSection,
} from '@/db/types';

interface LogFoodSheetProps {
  open: boolean;
  food: Food | null;
  onClose: () => void;
}

function sectionForNow(): MealSection {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

export function LogFoodSheet({ open, food, onClose }: LogFoodSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={food?.name ?? 'Log food'}>
      {food ? <LogFoodInner key={food.id} food={food} onClose={onClose} /> : <div />}
    </Sheet>
  );
}

function LogFoodInner({ food, onClose }: { food: Food; onClose: () => void }) {
  const [date, setDate] = useState(todayLocal());
  const [section, setSection] = useState<MealSection>(sectionForNow());

  const handleSave = async (state: QuantityState, macros: ResolvedMacros) => {
    if (macros.grams <= 0) return;
    await createDiaryEntry({
      date,
      section,
      kind: 'food',
      food_id: food.id,
      qty: state.qty,
      unit: macros.unit,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
      sugar: macros.sugar,
      sodium: macros.sodium,
    });
    toast({
      message: `${food.name} added to ${MEAL_SECTION_LABELS[section]} · ${formatDayHeader(date)}`,
      variant: 'success',
    });
    onClose();
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 border-b border-border p-4">
        <LabeledInput
          label="Date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Meal section
          </span>
          <Select
            value={section}
            onChange={(e) => setSection(e.target.value as MealSection)}
          >
            {MEAL_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {MEAL_SECTION_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <QuantityStep
        food={food}
        saveLabel="Add to diary"
        onBack={onClose}
        onSave={handleSave}
      />
    </>
  );
}
