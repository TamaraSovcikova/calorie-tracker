import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, ChevronRight, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMeals } from '@/db/repos/meals';

export function MealsPage() {
  const navigate = useNavigate();
  const meals = useMeals();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!meals) return [];
    const q = query.trim().toLowerCase();
    if (!q) return meals;
    return meals.filter((m) => m.name.toLowerCase().includes(q));
  }, [meals, query]);

  return (
    <>
      <PageHeader
        title="Meals"
        subtitle="Saved meal templates"
        trailing={
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate('/meals/new')}
            aria-label="New meal"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        }
      />
      <div className="mx-auto max-w-md space-y-3 px-4 py-4">
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
            <ChefHat className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
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
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/meals/${m.id}/edit`)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 active:scale-[0.99] transition-transform"
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
    </>
  );
}
