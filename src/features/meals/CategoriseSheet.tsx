import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { MealCategoryPicker } from './MealCategoryPicker';
import { suggestMealCategory } from './mealCategory';
import { updateMeal } from '@/db/repos/meals';
import type { MealWithTotals } from './useMealsWithTotals';
import type { MealCategory, MealSection } from '@/db/types';

const SECTION_TO_CATEGORY: Record<MealSection, MealCategory> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snacks: 'snack',
};

interface CategoriseSheetProps {
  open: boolean;
  meals: MealWithTotals[];
  logStats?: Map<string, { count: number; topSection: MealSection | undefined }>;
  onClose: () => void;
}

/**
 * One-time backfill: suggests a category for every uncategorised meal (from
 * its name + ingredients, falling back to the section it's most often logged
 * into) and lets the user confirm/override each before a bulk save.
 */
export function CategoriseSheet({
  open,
  meals,
  logStats,
  onClose,
}: CategoriseSheetProps) {
  const [choices, setChoices] = useState<Record<string, MealCategory>>({});
  const [saving, setSaving] = useState(false);

  // Seed the suggestions each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const seed: Record<string, MealCategory> = {};
    for (const m of meals) {
      const section = logStats?.get(m.meal.id)?.topSection;
      const fallback = section ? SECTION_TO_CATEGORY[section] : 'other';
      seed[m.meal.id] = suggestMealCategory(m.haystack, fallback) ?? 'other';
    }
    setChoices(seed);
    // Re-seed only on open; meals/logStats are snapshotted at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const m of meals) {
        const cat = choices[m.meal.id];
        if (cat) await updateMeal(m.meal.id, { category: cat });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Auto-categorise meals">
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          We guessed a category for each meal from its name and ingredients.
          Adjust any that are off, then save.
        </p>
        {meals.map((m) => (
          <div
            key={m.meal.id}
            className="space-y-2 rounded-xl border border-border p-3"
          >
            <div className="truncate text-sm font-medium">{m.meal.name}</div>
            <MealCategoryPicker
              value={choices[m.meal.id]}
              onChange={(cat) =>
                setChoices((c) => ({ ...c, [m.meal.id]: cat }))
              }
            />
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          block
          variant="primary"
          disabled={saving || meals.length === 0}
          onClick={() => void saveAll()}
        >
          {saving
            ? 'Saving…'
            : `Save ${meals.length} ${meals.length === 1 ? 'category' : 'categories'}`}
        </Button>
      </div>
    </Sheet>
  );
}
