import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Select } from '@/components/ui/Select';
import { LabeledInput } from '@/components/ui/Input';
import { LogMealStep } from './LogMealStep';
import { useMealResolved } from './useMealResolved';
import { multiplyTotals } from './mealMath';
import { createDiaryEntry } from '@/db/repos/diary';
import { toast } from '@/components/ui/toast';
import { formatDayHeader, todayLocal } from '@/lib/dates';
import {
  MEAL_SECTIONS,
  MEAL_SECTION_LABELS,
  type Meal,
  type MealSection,
} from '@/db/types';

interface LogMealSheetProps {
  open: boolean;
  meal: Meal | null;
  onClose: () => void;
}

/** Default the section to whatever meal of the day it currently is. */
function sectionForNow(): MealSection {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

/**
 * Log a saved meal straight to the diary - pick a date, section, and
 * portion. Used from the Library so a meal can be logged without first
 * opening a diary day.
 */
export function LogMealSheet({ open, meal, onClose }: LogMealSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Log meal">
      {meal ? <LogMealInner key={meal.id} meal={meal} onClose={onClose} /> : <div />}
    </Sheet>
  );
}

function LogMealInner({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const [date, setDate] = useState(todayLocal());
  const [section, setSection] = useState<MealSection>(sectionForNow());
  const resolved = useMealResolved(meal.id);

  const handleSave = async (mult: number) => {
    if (!resolved) return;
    const totals = multiplyTotals(resolved.totals, mult);
    await createDiaryEntry({
      date,
      section,
      kind: 'meal',
      meal_id: meal.id,
      qty: mult,
      unit: 'serving',
      portion_multiplier: mult,
      kcal: totals.kcal,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      fiber: totals.fiber,
      sugar: totals.sugar,
      sodium: totals.sodium,
    });
    toast({
      message: `${meal.name} added to ${MEAL_SECTION_LABELS[section]} · ${formatDayHeader(date)}`,
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
      <LogMealStep mealId={meal.id} onBack={onClose} onSave={handleSave} />
    </>
  );
}
