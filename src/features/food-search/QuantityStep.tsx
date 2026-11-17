import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { formatKcal, formatGrams } from '@/lib/macros';
import {
  availableModes,
  computeMacros,
  defaultQuantity,
  type QuantityMode,
  type QuantityState,
  type ResolvedMacros,
} from './foodMath';
import { getFood, updateFood } from '@/db/repos/foods';
import { mergeUnits, readUnitDraft } from './customUnits';
import { suggestPortions } from '@/lib/portionSuggestions';
import type { CustomUnit, Food } from '@/db/types';

interface QuantityStepProps {
  food: Food;
  initial?: QuantityState;
  saveLabel?: string;
  onBack: () => void;
  onSave: (state: QuantityState, macros: ResolvedMacros) => void;
  onDelete?: () => void;
}

export function QuantityStep({
  food,
  initial,
  saveLabel = 'Add to diary',
  onBack,
  onSave,
  onDelete,
}: QuantityStepProps) {
  const [state, setState] = useState<QuantityState>(initial ?? defaultQuantity(food));
  const [customUnits, setCustomUnits] = useState<CustomUnit[]>(food.custom_units);
  const [editingUnits, setEditingUnits] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitLabel, setNewUnitLabel] = useState('');
  const [newUnitGrams, setNewUnitGrams] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);

  // `food` is whatever copy the parent happens to hold, and it is often an
  // old one: a search result or a diary entry's food fetched before a unit
  // was added. Starting from that copy made a unit added a minute ago look
  // gone, and the next unit saved then wrote the old list back over it. So
  // the units are read from the database whenever the food changes.
  // Keyed on food.id, not the units array, so a just-added unit is kept.
  useEffect(() => {
    let cancelled = false;
    setCustomUnits(food.custom_units);
    void getFood(food.id).then((fresh) => {
      if (!cancelled && fresh) {
        setCustomUnits((local) => mergeUnits(fresh.custom_units ?? [], local));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.id]);

  // `food` is a prop snapshot the parent owns; custom units added here are
  // tracked locally (and persisted) so they appear immediately without
  // waiting for a prop refresh that never comes.
  const liveFood = useMemo<Food>(
    () => ({ ...food, custom_units: customUnits }),
    [food, customUnits],
  );
  const modes = useMemo(() => availableModes(liveFood), [liveFood]);
  const macros = useMemo(() => computeMacros(liveFood, state), [liveFood, state]);
  const valid = state.qty > 0 && Number.isFinite(state.qty) && macros.grams > 0;

  // Rule-based suggestions shown when the food has no custom units yet.
  const suggestions = useMemo(
    () =>
      customUnits.length === 0
        ? suggestPortions(food.name, food.brand)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [food.id, food.name, food.brand, customUnits.length],
  );

  /** Save the unit list. Adds are merged onto what is stored right now. */
  const persistUnits = async (next: CustomUnit[]) => {
    setCustomUnits(next);
    await updateFood(food.id, { custom_units: next });
  };
  const addUnit = async (unit: CustomUnit): Promise<void> => {
    const stored = (await getFood(food.id))?.custom_units ?? [];
    await persistUnits(mergeUnits(mergeUnits(stored, customUnits), [unit]));
    setState({ mode: `unit:${unit.label}` as QuantityMode, qty: 1 });
  };

  // Add a suggested unit and immediately switch to it.
  const addSuggestion = (unit: CustomUnit) => addUnit(unit);

  /**
   * Save what is typed in the two unit fields. Returns false when there is
   * something typed that cannot be saved (and says why).
   */
  const handleAddCustomUnit = async (): Promise<boolean> => {
    const draft = readUnitDraft(newUnitLabel, newUnitGrams, customUnits);
    if (draft.error) {
      setUnitError(draft.error);
      return false;
    }
    setUnitError(null);
    if (!draft.unit) return true;
    await addUnit(draft.unit);
    setShowAddUnit(false);
    setNewUnitLabel('');
    setNewUnitGrams('');
    return true;
  };

  const handleRemoveUnit = async (label: string) => {
    const next = customUnits.filter((u) => u.label !== label);
    await persistUnits(next);
    if (state.mode === `unit:${label}`) {
      setState(defaultQuantity({ ...food, custom_units: next }));
    }
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h2 className="mt-1 truncate text-lg font-semibold">{food.name}</h2>
        {food.brand && (
          <p className="truncate text-xs text-muted-foreground">{food.brand}</p>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <LabeledInput
              label="Quantity"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={Number.isFinite(state.qty) ? state.qty : ''}
              onChange={(e) =>
                setState((s) => ({ ...s, qty: parseFloat(e.target.value) }))
              }
              autoFocus
            />
          </div>
          <div className="flex-[1.5]">
            <div className="flex h-5 items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Unit
              </span>
              {customUnits.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEditingUnits((v) => !v)}
                  aria-label="Edit custom units"
                  aria-pressed={editingUnits}
                  className={
                    editingUnits
                      ? 'rounded p-0.5 text-primary'
                      : 'rounded p-0.5 text-muted-foreground hover:text-foreground'
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <select
              value={state.mode}
              onChange={(e) =>
                setState((s) => ({ ...s, mode: e.target.value as QuantityMode }))
              }
              aria-label="Unit"
              className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {modes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {editingUnits && customUnits.length > 0 && (
          <div className="space-y-1 rounded-lg border border-dashed border-border p-3">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Custom units - tap a trash icon to remove
            </span>
            <ul className="space-y-1">
              {customUnits.map((u) => (
                <li
                  key={u.label}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
                >
                  <span>
                    1 {u.label} = {formatGrams(u.grams)} g
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveUnit(u.label)}
                    aria-label={`Remove ${u.label}`}
                    className="tap-target rounded-md p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">
              Typical portions - tap to add:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((u) => (
                <button
                  key={u.label}
                  type="button"
                  onClick={() => void addSuggestion(u)}
                  className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 active:scale-95 transition-transform"
                >
                  <Plus className="h-3 w-3" />
                  {u.label} ({formatGrams(u.grams)} g)
                </button>
              ))}
            </div>
          </div>
        )}

        {!showAddUnit ? (
          <button
            type="button"
            onClick={() => setShowAddUnit(true)}
            className="tap-target inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add a custom unit (e.g. "1 scoop = 35 g")
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Unit name e.g. scoop"
                value={newUnitLabel}
                aria-label="Unit name"
                autoFocus
                onChange={(e) => {
                  setNewUnitLabel(e.target.value);
                  setUnitError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddCustomUnit();
                }}
              />
              {/* A text field, not type=number: a number field returns an
                  empty string for "37,5" and the unit silently vanished. */}
              <Input
                placeholder="Grams"
                type="text"
                inputMode="decimal"
                aria-label="Grams in one unit"
                value={newUnitGrams}
                onChange={(e) => {
                  setNewUnitGrams(e.target.value);
                  setUnitError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddCustomUnit();
                }}
              />
            </div>
            {unitError && (
              <p role="alert" className="text-xs text-destructive">
                {unitError}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="primary" block onClick={() => void handleAddCustomUnit()}>
                Save unit
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowAddUnit(false);
                  setUnitError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            For {formatGrams(macros.grams)} g
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-3xl font-semibold tabular-nums">
              {formatKcal(macros.kcal)}
            </div>
            <div className="text-sm text-muted-foreground">kcal</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <MacroChip label="Protein" value={macros.protein} colorVar="protein" />
            <MacroChip label="Carbs" value={macros.carbs} colorVar="carbs" />
            <MacroChip label="Fat" value={macros.fat} colorVar="fat" />
          </div>
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t border-border bg-card p-4">
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            className="shrink-0 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          block
          disabled={!valid}
          onClick={() => {
            // A unit typed in but not yet saved would be lost here. Save it
            // first; it becomes the selected unit, and the next tap logs.
            if (showAddUnit && (newUnitLabel.trim() || newUnitGrams.trim())) {
              void handleAddCustomUnit();
              return;
            }
            if (valid) onSave(state, macros);
          }}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function MacroChip({
  label,
  value,
  colorVar,
}: {
  label: string;
  value: number;
  colorVar: 'protein' | 'carbs' | 'fat';
}) {
  return (
    <div className="rounded-md bg-card p-2">
      <div
        className="text-sm font-semibold tabular-nums"
        style={{ color: `hsl(var(--${colorVar}))` }}
      >
        {Math.round(value)}g
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
