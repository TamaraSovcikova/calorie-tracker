import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { IngredientPickerSheet } from './IngredientPickerSheet';
import { useMealResolved } from './useMealResolved';
import { computeMealTotals } from './mealMath';
import { computeMacros } from '@/features/food-search/foodMath';
import { itemToQuantity } from './mealMath';
import {
  createMeal,
  duplicateMeal,
  replaceMealItems,
  softDeleteMeal,
  updateMeal,
  type MealItemInput,
} from '@/db/repos/meals';
import { db } from '@/db/dexie';
import type { Food } from '@/db/types';
import { formatGrams, formatKcal } from '@/lib/macros';

interface DraftItem {
  /** stable client id so React lists are stable while editing */
  uiKey: string;
  food_id: string;
  qty: number;
  unit: string;
  /** snapshot for live totals — refreshed when food changes */
  food?: Food;
}

function inputToDraft(input: MealItemInput, food: Food | undefined, uiKey: string): DraftItem {
  return { uiKey, food_id: input.food_id, qty: input.qty, unit: input.unit, food };
}

let _key = 0;
const nextKey = () => `${Date.now()}-${_key++}`;

interface MealEditorProps {
  mode: 'create' | 'edit';
}

export function MealEditor({ mode }: MealEditorProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const resolved = useMealResolved(mode === 'edit' ? id : undefined);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate from existing meal once it loads.
  useEffect(() => {
    if (mode !== 'edit' || !resolved) return;
    setName(resolved.meal.name);
    setNotes(resolved.meal.notes ?? '');
    setItems(
      resolved.items.map((it) =>
        inputToDraft(
          { food_id: it.food_id, qty: it.qty, unit: it.unit },
          resolved.foodsById.get(it.food_id),
          nextKey(),
        ),
      ),
    );
  }, [mode, resolved]);

  const totals = useMemo(() => {
    if (items.length === 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const foodsById = new Map<string, Food>();
    for (const it of items) if (it.food) foodsById.set(it.food_id, it.food);
    return computeMealTotals(
      items.map((it) => ({
        id: it.uiKey,
        meal_id: 'draft',
        food_id: it.food_id,
        qty: it.qty,
        unit: it.unit,
      })),
      foodsById,
    );
  }, [items]);

  const addIngredient = (input: MealItemInput, food: Food) =>
    setItems((curr) => [...curr, inputToDraft(input, food, nextKey())]);

  const removeIngredient = (uiKey: string) =>
    setItems((curr) => curr.filter((i) => i.uiKey !== uiKey));

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const itemInputs: MealItemInput[] = items.map((it) => ({
        food_id: it.food_id,
        qty: it.qty,
        unit: it.unit,
      }));
      if (mode === 'create') {
        await createMeal({ name: trimmed, notes: notes.trim() || undefined, items: itemInputs });
      } else if (id) {
        await updateMeal(id, { name: trimmed, notes: notes.trim() || undefined });
        await replaceMealItems(id, itemInputs);
      }
      navigate('/meals');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm(`Delete meal "${name}"?`)) return;
    await softDeleteMeal(id);
    navigate('/meals');
  };

  const handleDuplicate = async () => {
    if (!id) return;
    const dup = await duplicateMeal(id);
    if (dup) navigate(`/meals/${dup.id}/edit`);
  };

  if (mode === 'edit' && resolved === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (mode === 'edit' && resolved === null) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Meal not found.
        <div className="mt-3">
          <Button variant="ghost" onClick={() => navigate('/meals')}>
            Back to meals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/meals')}
          className="tap-target flex items-center gap-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">
          {mode === 'create' ? 'New meal' : 'Edit meal'}
        </h1>
        {mode === 'edit' && (
          <>
            <button
              type="button"
              onClick={handleDuplicate}
              className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Duplicate meal"
            >
              <Copy className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="tap-target rounded-md p-2 text-destructive hover:bg-muted"
              aria-label="Delete meal"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </>
        )}
      </header>

      <div className="space-y-4 p-4">
        <LabeledInput
          label="Meal name"
          placeholder="e.g. Chicken & rice bowl"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={mode === 'create'}
        />
        <LabeledInput
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Per portion
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {formatKcal(totals.kcal)}
            </span>
            <span className="text-sm text-muted-foreground">kcal</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
            <div>Protein {Math.round(totals.protein)} g</div>
            <div>Carbs {Math.round(totals.carbs)} g</div>
            <div>Fat {Math.round(totals.fat)} g</div>
          </div>
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Ingredients
            </h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Add ingredients to build the meal.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {items.map((it) => (
                <IngredientRow
                  key={it.uiKey}
                  draft={it}
                  onRemove={() => removeIngredient(it.uiKey)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          type="button"
          variant="primary"
          block
          disabled={!name.trim() || saving}
          onClick={handleSave}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save meal'}
        </Button>
      </div>

      <IngredientPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPicked={addIngredient}
      />
    </div>
  );
}

function IngredientRow({
  draft,
  onRemove,
}: {
  draft: DraftItem;
  onRemove: () => void;
}) {
  // Lazy-load food in case it wasn't included in the initial hydrate.
  const [food, setFood] = useState<Food | undefined>(draft.food);
  useEffect(() => {
    if (food) return;
    let cancelled = false;
    void db.foods.get(draft.food_id).then((f) => {
      if (!cancelled && f) setFood(f);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.food_id, food]);

  const macros = food
    ? computeMacros(food, itemToQuantity({
        id: '',
        meal_id: '',
        food_id: draft.food_id,
        qty: draft.qty,
        unit: draft.unit,
      }))
    : null;

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{food?.name ?? '…'}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
          {formatGrams(draft.qty)} {draft.unit}
          {macros && ` · ${formatKcal(macros.kcal)} kcal`}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove ingredient"
        className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
