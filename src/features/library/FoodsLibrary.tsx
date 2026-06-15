import { useMemo, useState } from 'react';
import { Apple, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';
import { ManualEntryForm } from '@/features/food-search/ManualEntryForm';
import { useMyProducts, restoreFood, softDeleteFood } from '@/db/repos/foods';
import { formatKcal } from '@/lib/macros';
import type { Food } from '@/db/types';

/** Foods sub-tab of the Library: the user's custom products. */
export function FoodsLibrary() {
  const foods = useMyProducts();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Food | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    if (!foods) return [];
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand?.toLowerCase().includes(q) ?? false),
    );
  }, [foods, query]);

  const handleDelete = async (food: Food) => {
    await softDeleteFood(food.id);
    toast({
      message: `${food.name} removed`,
      action: { label: 'Undo', onClick: () => void restoreFood(food.id) },
    });
  };

  return (
    <>
      <Button block variant="primary" onClick={() => setCreating(true)}>
        <Plus className="h-4 w-4" />
        New food
      </Button>

      {foods && foods.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search your foods…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {!foods ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : foods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Apple
            className="mx-auto h-10 w-10 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="mt-3 text-base font-medium">No custom foods yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap <span className="font-medium text-foreground">New food</span> to
            add one by hand or by scanning a nutrition label. It's saved here to
            reuse and edit.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No foods match "{query}".
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((food) => (
            <li
              key={food.id}
              className="flex items-center gap-1 rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setEditing(food)}
                className="min-w-0 flex-1 rounded-l-2xl px-4 py-3 text-left hover:bg-muted/40 active:scale-[0.99] transition-transform"
              >
                <div className="truncate text-sm font-medium">
                  {food.name}
                  {food.brand && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {food.brand}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {formatKcal(food.kcal_100)} kcal / 100 g
                </div>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(food)}
                aria-label={`Delete ${food.name}`}
                className="tap-target mr-1 rounded-lg p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit product"
      >
        {editing && (
          <ManualEntryForm
            key={editing.id}
            food={editing}
            onBack={() => setEditing(null)}
            onCreated={() => {
              setEditing(null);
              toast({ message: 'Product saved', variant: 'success' });
            }}
          />
        )}
      </Sheet>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New food">
        {creating && (
          <ManualEntryForm
            onBack={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              toast({ message: 'Food saved', variant: 'success' });
            }}
          />
        )}
      </Sheet>
    </>
  );
}
