import { useMemo, useState } from 'react';
import { ChefHat, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useMeals } from '@/db/repos/meals';
import type { Meal } from '@/db/types';

interface MealPickerProps {
  onPick: (meal: Meal) => void;
}

export function MealPicker({ onPick }: MealPickerProps) {
  const meals = useMeals();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!meals) return [];
    const q = query.trim().toLowerCase();
    if (!q) return meals;
    return meals.filter((m) => m.name.toLowerCase().includes(q));
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
          Build a meal in the Meals tab, then log it here.
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
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 active:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  {m.notes && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {m.notes}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
