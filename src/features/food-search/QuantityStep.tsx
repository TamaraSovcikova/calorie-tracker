import { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { formatKcal, formatGrams } from '@/lib/macros';
import {
  availableModes,
  computeMacros,
  defaultQuantity,
  type QuantityMode,
  type QuantityState,
} from './foodMath';
import { updateFood } from '@/db/repos/foods';
import type { CustomUnit, Food } from '@/db/types';

interface QuantityStepProps {
  food: Food;
  initial?: QuantityState;
  saveLabel?: string;
  onBack: () => void;
  onSave: (state: QuantityState) => void;
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
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitLabel, setNewUnitLabel] = useState('');
  const [newUnitGrams, setNewUnitGrams] = useState('');

  const modes = useMemo(() => availableModes(food), [food]);
  const macros = useMemo(() => computeMacros(food, state), [food, state]);
  const valid = state.qty > 0 && Number.isFinite(state.qty) && macros.grams > 0;

  const handleAddCustomUnit = async () => {
    const grams = parseFloat(newUnitGrams);
    const label = newUnitLabel.trim();
    if (!label || !Number.isFinite(grams) || grams <= 0) return;
    const next: CustomUnit[] = [...food.custom_units, { label, grams }];
    await updateFood(food.id, { custom_units: next });
    setState({ mode: `unit:${label}` as QuantityMode, qty: 1 });
    setShowAddUnit(false);
    setNewUnitLabel('');
    setNewUnitGrams('');
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
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Unit
              </span>
              <select
                value={state.mode}
                onChange={(e) =>
                  setState((s) => ({ ...s, mode: e.target.value as QuantityMode }))
                }
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {modes.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!showAddUnit ? (
          <button
            type="button"
            onClick={() => setShowAddUnit(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add a custom unit (e.g. "1 scoop = 35 g")
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Unit name e.g. scoop"
                value={newUnitLabel}
                onChange={(e) => setNewUnitLabel(e.target.value)}
              />
              <Input
                placeholder="Grams"
                type="number"
                inputMode="decimal"
                value={newUnitGrams}
                onChange={(e) => setNewUnitGrams(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={handleAddCustomUnit}>
                Save unit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddUnit(false)}
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
            aria-label="Delete entry"
            className="!w-11 px-0 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          block
          disabled={!valid}
          onClick={() => valid && onSave(state)}
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
