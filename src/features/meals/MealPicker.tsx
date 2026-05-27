import { useMemo, useState } from 'react';
import { ChefHat, ChevronRight, Search, Star } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useMealsWithTotals } from './useMealsWithTotals';
import { matchesMealQuery } from './mealMath';
import type { Meal } from '@/db/types';

interface MealPickerProps {
  onPick: (meal: Meal) => void;
}

export function MealPicker({ onPick }: MealPickerProps) {
  const meals = useMealsWithTotals();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!meals) return [];
    return meals.filter((m) => matchesMealQuery(m.haystack, query));
  }, [meals, query]);

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
      <div className="border-b border-border p-4">
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
      </div>
      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No meals match "{query}".
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
