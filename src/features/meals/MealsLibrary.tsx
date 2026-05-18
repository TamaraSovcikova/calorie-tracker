import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LogMealSheet } from './LogMealSheet';
import { useMealsWithTotals } from './useMealsWithTotals';
import { formatServings } from './mealMath';
import { formatKcal } from '@/lib/macros';
import type { Meal } from '@/db/types';

/** Meals sub-tab of the Library: saved meal templates, tap to log. */
export function MealsLibrary() {
  const navigate = useNavigate();
  const meals = useMealsWithTotals();
  const [query, setQuery] = useState('');
  const [logging, setLogging] = useState<Meal | null>(null);

  const filtered = useMemo(() => {
    if (!meals) return [];
    const q = query.trim().toLowerCase();
    if (!q) return meals;
    return meals.filter((m) => m.meal.name.toLowerCase().includes(q));
  }, [meals, query]);

  return (
    <>
      {meals && meals.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search meals…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {!meals ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : meals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <ChefHat
            className="mx-auto h-10 w-10 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="mt-3 text-base font-medium">No saved meals yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a meal once, log it any day with one tap.
          </p>
          <Button className="mt-4" onClick={() => navigate('/meals/new')}>
            <Plus className="h-4 w-4" />
            Create your first meal
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No meals match "{query}".
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ meal, totals, itemCount, servings }) => (
            <li
              key={meal.id}
              className="flex items-center gap-1 rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setLogging(meal)}
                className="min-w-0 flex-1 rounded-l-2xl px-4 py-3 text-left hover:bg-muted/40 active:scale-[0.99] transition-transform"
              >
                <div className="truncate text-sm font-medium">{meal.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  <span className="mx-1.5">·</span>
                  <span className="font-medium text-foreground">
                    {formatKcal(totals.kcal)}
                  </span>{' '}
                  kcal{servings > 1 ? '/portion' : ''}
                  {servings > 1 && (
                    <>
                      <span className="mx-1.5">·</span>
                      makes {formatServings(servings)}
                    </>
                  )}
                </div>
                {meal.notes && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {meal.notes}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/meals/${meal.id}/edit`)}
                aria-label={`Edit ${meal.name}`}
                className="tap-target mr-1 rounded-lg p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LogMealSheet
        open={logging !== null}
        meal={logging}
        onClose={() => setLogging(null)}
      />
    </>
  );
}
