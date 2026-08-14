import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Copy,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { downscaleImage } from '@/features/photo-log/photoLog';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { CaptureOverlay } from '@/features/food-search/CaptureOverlay';
import { IngredientPickerSheet } from './IngredientPickerSheet';
import { MealCategoryPicker } from './MealCategoryPicker';
import { mealCategories, parseCustomCategories, suggestMealCategory } from './mealCategory';
import { useProfile, updateProfile } from '@/db/repos/profile';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import { useMealResolved } from './useMealResolved';
import {
  computeMealTotals,
  getServings,
  itemToQuantity,
  perServingTotals,
} from './mealMath';
import { computeMacros } from '@/features/food-search/foodMath';
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
import { toast } from '@/components/ui/toast';
import {
  clearMealDraft,
  loadMealDraft,
  saveMealDraft,
} from './mealDraft';

interface DraftItem {
  /** stable client id so React lists are stable while editing */
  uiKey: string;
  food_id: string;
  qty: number;
  unit: string;
  /** snapshot for live totals - refreshed when food changes */
  food?: Food;
}

function inputToDraft(input: MealItemInput, food: Food | undefined, uiKey: string): DraftItem {
  return { uiKey, food_id: input.food_id, qty: input.qty, unit: input.unit, food };
}

let _key = 0;
const nextKey = () => `${Date.now()}-${_key++}`;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface MealEditorProps {
  mode: 'create' | 'edit';
}

export function MealEditor({ mode }: MealEditorProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const resolved = useMealResolved(mode === 'edit' ? id : undefined);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [servings, setServings] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  // Once the user edits categories, stop following the auto-suggestion.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const profile = useProfile();
  const customCategories = useMemo(
    () => parseCustomCategories(profile?.custom_meal_categories),
    [profile?.custom_meal_categories],
  );
  const [items, setItems] = useState<DraftItem[]>([]);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imageBusy, setImageBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftActive, setDraftActive] = useState(false);

  const handlePickPhoto = async (file: Blob) => {
    setImageBusy(true);
    try {
      const small = await downscaleImage(file, 640);
      setImageUrl(await blobToDataUrl(small));
    } finally {
      setImageBusy(false);
    }
  };

  // Create mode: hydrate from diary entries passed in via router state
  // (the "build a meal from selected foods" shortcut on the diary).
  useEffect(() => {
    if (mode !== 'create') return;
    const state = location.state as {
      prefillItems?: MealItemInput[];
      prefillName?: string;
      prefillNotes?: string;
      prefillServings?: number;
    } | null;
    if (!state) return;
    // From the recipe scanner / other prefill flows.
    if (state.prefillName) setName(state.prefillName);
    if (state.prefillNotes) setNotes(state.prefillNotes);
    if (state.prefillServings && state.prefillServings > 0) {
      setServings(state.prefillServings);
    }
    const prefill = state.prefillItems;
    if (!prefill || prefill.length === 0) return;
    let cancelled = false;
    void (async () => {
      const foods = await db.foods.bulkGet(prefill.map((p) => p.food_id));
      if (cancelled) return;
      const byId = new Map<string, Food>();
      for (const f of foods) if (f) byId.set(f.id, f);
      setItems(prefill.map((p) => inputToDraft(p, byId.get(p.food_id), nextKey())));
    })();
    return () => {
      cancelled = true;
    };
    // location.state is fixed for this navigation entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Hydrate from existing meal once it loads.
  useEffect(() => {
    if (mode !== 'edit' || !resolved) return;
    setName(resolved.meal.name);
    setNotes(resolved.meal.notes ?? '');
    setServings(getServings(resolved.meal));
    setImageUrl(resolved.meal.image_url ?? undefined);
    const existing = mealCategories(resolved.meal);
    setCategories(existing);
    // An already-categorised meal shouldn't be overridden by the suggestion.
    setCategoryTouched(existing.length > 0);
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

  // Create mode: restore an autosaved draft, unless this is a prefilled
  // session (build-a-meal-from-foods / recipe scan), which takes priority.
  useEffect(() => {
    if (mode !== 'create') return;
    const state = location.state as
      | { prefillItems?: unknown; prefillName?: unknown }
      | null;
    if (state?.prefillItems || state?.prefillName) return;
    const draft = loadMealDraft();
    if (!draft) return;
    setName(draft.name);
    setNotes(draft.notes);
    setServings(draft.servings > 0 ? draft.servings : 1);
    setCategories(draft.categories);
    setCategoryTouched(draft.categoryTouched);
    setImageUrl(draft.imageUrl);
    setDraftActive(true);
    if (draft.items.length > 0) {
      void (async () => {
        const foods = await db.foods.bulkGet(draft.items.map((i) => i.food_id));
        const byId = new Map<string, Food>();
        for (const f of foods) if (f) byId.set(f.id, f);
        setItems(
          draft.items.map((i) => inputToDraft(i, byId.get(i.food_id), nextKey())),
        );
      })();
    }
    toast({
      message: 'Draft restored - pick up where you left off.',
      variant: 'success',
    });
    // Runs once per create session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Autosave the create-mode draft (debounced) as the meal is built, so
  // leaving the editor mid-way keeps everything for next time.
  useEffect(() => {
    if (mode !== 'create') return;
    const t = setTimeout(() => {
      const payload = {
        name,
        notes,
        servings,
        categories,
        categoryTouched,
        imageUrl,
        items: items.map((it) => ({
          food_id: it.food_id,
          qty: it.qty,
          unit: it.unit,
        })),
      };
      saveMealDraft(payload);
      setDraftActive(
        name.trim().length > 0 ||
          notes.trim().length > 0 ||
          items.length > 0 ||
          !!imageUrl,
      );
    }, 500);
    return () => clearTimeout(t);
  }, [mode, name, notes, servings, categories, categoryTouched, imageUrl, items]);

  const totals = useMemo(() => {
    if (items.length === 0)
      return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
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

  const perPortion = useMemo(
    () => perServingTotals(totals, servings > 0 ? servings : 1),
    [totals, servings],
  );

  // Auto-suggest a category from the name + ingredient names. Followed live
  // until the user edits categories; then their choice sticks.
  const suggestedCategory = useMemo(() => {
    const text = [name, ...items.map((it) => it.food?.name ?? '')].join(' ');
    return suggestMealCategory(text);
  }, [name, items]);
  const effectiveCategories = categoryTouched
    ? categories
    : suggestedCategory
      ? [suggestedCategory]
      : [];

  const handleCategoriesChange = (next: string[]) => {
    setCategoryTouched(true);
    setCategories(next);
  };
  const handleAddCustomCategory = (token: string) => {
    setCategoryTouched(true);
    if (!customCategories.includes(token)) {
      void updateProfile({
        custom_meal_categories: JSON.stringify([...customCategories, token]),
      });
    }
  };

  const addIngredient = (input: MealItemInput, food: Food) =>
    setItems((curr) => [...curr, inputToDraft(input, food, nextKey())]);

  const removeIngredient = (uiKey: string) =>
    setItems((curr) => curr.filter((i) => i.uiKey !== uiKey));

  const editIngredient = (uiKey: string, qty: number, unit: string) =>
    setItems((curr) =>
      curr.map((i) => (i.uiKey === uiKey ? { ...i, qty, unit } : i)),
    );

  const editingDraft = items.find((i) => i.uiKey === editingKey) ?? null;

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
      const safeServings = servings > 0 ? servings : 1;
      if (mode === 'create') {
        await createMeal({
          name: trimmed,
          notes: notes.trim() || undefined,
          servings: safeServings,
          image_url: imageUrl,
          categories: effectiveCategories,
          items: itemInputs,
        });
        clearMealDraft();
      } else if (id) {
        await updateMeal(id, {
          name: trimmed,
          notes: notes.trim() || undefined,
          // undefined clears the column in Dexie (photo removed).
          image_url: imageUrl,
          servings: safeServings,
          categories: effectiveCategories,
        });
        await replaceMealItems(id, itemInputs);
      }
      navigate('/library');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm(`Delete meal "${name}"?`)) return;
    await softDeleteMeal(id);
    navigate('/library');
  };

  const handleDuplicate = async () => {
    if (!id) return;
    const dup = await duplicateMeal(id);
    if (dup) navigate(`/meals/${dup.id}/edit`);
  };

  const handleDiscardDraft = () => {
    if (!confirm('Discard this draft meal?')) return;
    clearMealDraft();
    navigate('/library');
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
          <Button variant="ghost" onClick={() => navigate('/library')}>
            Back to library
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
          onClick={() => navigate('/library')}
          className="tap-target flex items-center gap-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">
          {mode === 'create' ? 'New meal' : 'Edit meal'}
        </h1>
        {mode === 'create' && draftActive && (
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="tap-target rounded-md p-2 text-destructive hover:bg-muted"
            aria-label="Discard draft"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
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

        <MealCategoryPicker
          value={effectiveCategories}
          customCategories={customCategories}
          suggested={!categoryTouched && !!suggestedCategory}
          onChange={handleCategoriesChange}
          onAddCustom={handleAddCustomCategory}
        />

        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Photo (optional)
          </span>
          <CaptureOverlay
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onCapture={(image) => {
              setCameraOpen(false);
              void handlePickPhoto(image);
            }}
            title="Photo for this meal"
            hint="Frame the dish, then tap the shutter."
            guide="none"
          />
          {imageUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-border">
              <img src={imageUrl} alt="" className="h-40 w-full object-cover" />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="rounded-full bg-background/90 p-2 text-foreground shadow-sm hover:bg-background"
                  aria-label="Replace photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="rounded-full bg-background/90 p-2 text-foreground shadow-sm hover:bg-background"
                  aria-label="Replace photo (alt)"
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageUrl(undefined)}
                  className="rounded-full bg-background/90 p-2 text-destructive shadow-sm hover:bg-background"
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            /* One button, because the shared camera already offers the
               gallery beside the shutter. Two buttons here was the app
               asking a question it can answer itself. */
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              disabled={imageBusy}
              className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-60"
            >
              {imageBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Add a photo
                </>
              )}
            </button>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notes / method (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </label>

        <div className="space-y-1">
          <LabeledInput
            label="This batch makes"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={Number.isFinite(servings) ? servings : ''}
            onChange={(e) => setServings(parseFloat(e.target.value))}
            trailing="portions"
          />
          <p className="px-1 text-xs text-muted-foreground">
            Add every ingredient for the whole batch - logging one portion
            uses {servings > 1 ? `1⁄${Math.round(servings)}` : 'all'} of it.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Per portion
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {formatKcal(perPortion.kcal)}
            </span>
            <span className="text-sm text-muted-foreground">kcal</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
            <div>Protein {Math.round(perPortion.protein)} g</div>
            <div>Carbs {Math.round(perPortion.carbs)} g</div>
            <div>Fat {Math.round(perPortion.fat)} g</div>
          </div>
          {servings > 1 && (
            <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground tabular-nums">
              Whole batch · {formatKcal(totals.kcal)} kcal ·{' '}
              {Math.round(totals.protein)} P / {Math.round(totals.carbs)} C /{' '}
              {Math.round(totals.fat)} F
            </div>
          )}
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
                  onEdit={() => setEditingKey(it.uiKey)}
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
      <EditIngredientSheet
        draft={editingDraft}
        onClose={() => setEditingKey(null)}
        onSave={(uiKey, qty, unit) => {
          editIngredient(uiKey, qty, unit);
          setEditingKey(null);
        }}
      />
    </div>
  );
}

/** Sheet to change the quantity/unit of an ingredient already in the meal. */
function EditIngredientSheet({
  draft,
  onClose,
  onSave,
}: {
  draft: DraftItem | null;
  onClose: () => void;
  onSave: (uiKey: string, qty: number, unit: string) => void;
}) {
  const [food, setFood] = useState<Food | undefined>(draft?.food);
  useEffect(() => {
    if (!draft) return;
    if (draft.food) {
      setFood(draft.food);
      return;
    }
    let cancelled = false;
    void db.foods.get(draft.food_id).then((f) => {
      if (!cancelled && f) setFood(f);
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={food?.name ?? 'Ingredient'}
    >
      {draft && food ? (
        <QuantityStep
          food={food}
          initial={itemToQuantity({
            id: '',
            meal_id: '',
            food_id: draft.food_id,
            qty: draft.qty,
            unit: draft.unit,
          })}
          saveLabel="Update ingredient"
          onBack={onClose}
          onSave={(state, macros) => onSave(draft.uiKey, state.qty, macros.unit)}
        />
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}
    </Sheet>
  );
}

function IngredientRow({
  draft,
  onEdit,
  onRemove,
}: {
  draft: DraftItem;
  onEdit: () => void;
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
    <li className="flex items-center justify-between gap-1 px-1 py-1">
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50 active:bg-muted"
      >
        <div className="truncate text-sm font-medium">{food?.name ?? '…'}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
          {formatGrams(draft.qty)} {draft.unit}
          {macros && (
            <>
              {' · '}{formatKcal(macros.kcal)} kcal
              {' · '}{Math.round(macros.protein)}P / {Math.round(macros.carbs)}C / {Math.round(macros.fat)}F
            </>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground/60">tap to edit</div>
      </button>
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
