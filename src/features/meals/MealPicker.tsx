import { useMemo, useState } from 'react';
import { ChefHat, ChevronRight, Search, Star } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { useMealsWithTotals } from './useMealsWithTotals';
import { matchesMealQuery } from './mealMath';
import { buildMealFilterChips, mealMatchesFilter } from './mealCategory';
import { useProfile } from '@/db/repos/profile';
import type { Meal } from '@/db/types';

interface MealPickerProps {
  onPick: (meal: Meal) => void;
}

export function MealPicker({ onPick }: MealPickerProps) {
  const meals = useMealsWithTotals();
  const profile = useProfile();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const chips = useMemo(
    () =>
      buildMealFilterChips(
        (meals ?? []).map((m) => m.meal),
        profile?.custom_meal_categories,
      ),
    [meals, profile?.custom_meal_categories],
  );

  const filtered = useMemo(() => {
    if (!meals) return [];
    return meals.filter(
      (m) =>
        matchesMealQuery(m.haystack, query) && mealMatchesFilter(m.meal, filter),
    );
  }, [meals, query, filter]);

  if (!meals) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (meals.length === 0) {
    return (
      <div className="p-8 text-center">
        <ChefHat className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="mt-3 text-base font-medium">No saved meals yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a meal in the Library tab, then log it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-3 border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search meals…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setFilter(chip.value)}
              aria-pressed={filter === chip.value}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filter === chip.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          {query ? `No meals match "${query}".` : 'No meals in this filter.'}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map(({ meal }) => (
            <li key={meal.id}>
              <button
                type="button"
                onClick={() => onPick(meal)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 active:bg-muted"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {meal.favorite && (
                    <Star
                      className="h-3.5 w-3.5 shrink-0 text-amber-500"
                      fill="currentColor"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{meal.name}</div>
                    {meal.notes && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {meal.notes}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
