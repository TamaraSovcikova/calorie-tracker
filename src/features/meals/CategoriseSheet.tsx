import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { MealCategoryPicker } from './MealCategoryPicker';
import { parseCustomCategories, suggestMealCategory } from './mealCategory';
import { updateMeal } from '@/db/repos/meals';
import { useProfile, updateProfile } from '@/db/repos/profile';
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
 * into) and lets the user confirm/override each (multi-select) before a bulk
 * save.
 */
export function CategoriseSheet({
  open,
  meals,
  logStats,
  onClose,
}: CategoriseSheetProps) {
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const profile = useProfile();
  const customCategories = useMemo(
    () => parseCustomCategories(profile?.custom_meal_categories),
    [profile?.custom_meal_categories],
  );

  // Seed the suggestions each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string[]> = {};
    for (const m of meals) {
      const section = logStats?.get(m.meal.id)?.topSection;
      const fallback = section ? SECTION_TO_CATEGORY[section] : 'other';
      seed[m.meal.id] = [suggestMealCategory(m.haystack, fallback) ?? 'other'];
    }
    setChoices(seed);
    // Re-seed only on open; meals/logStats are snapshotted at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addCustom = (token: string) => {
    if (!customCategories.includes(token)) {
      void updateProfile({
        custom_meal_categories: JSON.stringify([...customCategories, token]),
      });
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const m of meals) {
        const cats = choices[m.meal.id];
        if (cats && cats.length) await updateMeal(m.meal.id, { categories: cats });
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
          Adjust any that are off (a meal can have several), then save.
        </p>
        {meals.map((m) => (
          <div
            key={m.meal.id}
            className="space-y-2 rounded-xl border border-border p-3"
          >
            <div className="truncate text-sm font-medium">{m.meal.name}</div>
            <MealCategoryPicker
              value={choices[m.meal.id] ?? []}
              customCategories={customCategories}
              onAddCustom={addCustom}
              onChange={(cats) =>
                setChoices((c) => ({ ...c, [m.meal.id]: cats }))
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
            : `Save ${meals.length} ${meals.length === 1 ? 'meal' : 'meals'}`}
        </Button>
      </div>
    </Sheet>
  );
}
