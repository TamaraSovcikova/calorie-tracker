import { useRef, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, ScanText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { createFood, updateFood } from '@/db/repos/foods';
import { analyzeLabel, type ScannedLabel } from './photoLabel';
import { suggestPortions } from '@/lib/portionSuggestions';
import { formatGrams } from '@/lib/macros';
import type { CustomUnit, Food } from '@/db/types';

interface ManualEntryFormProps {
  initialName?: string;
  initialBarcode?: string;
  /** Pre-fill the macros from an already-scanned nutrition label (e.g. when
   *  the label was scanned from the Scan tab before reaching this form). */
  initialLabel?: ScannedLabel;
  /** When set, the form edits this existing custom food instead of creating one. */
  food?: Food;
  onBack: () => void;
  /** Fired with the created/updated food. */
  onCreated: (food: Food) => void;
}

interface FormState {
  name: string;
  brand: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  sodium: string;
  serving_g: string;
}

const numField = (v: number | null | undefined): string =>
  v != null ? String(v) : '';

export function ManualEntryForm({
  initialName = '',
  initialBarcode,
  initialLabel,
  food,
  onBack,
  onCreated,
}: ManualEntryFormProps) {
  const isEdit = food !== undefined;
  const [form, setForm] = useState<FormState>(() => {
    if (food) {
      return {
        name: food.name,
        brand: food.brand ?? '',
        kcal: String(food.kcal_100),
        protein: String(food.protein_100),
        carbs: String(food.carbs_100),
        fat: String(food.fat_100),
        fiber: numField(food.fiber_100),
        sugar: numField(food.sugar_100),
        sodium: numField(food.sodium_100),
        serving_g: numField(food.serving_g),
      };
    }
    if (initialLabel) {
      return {
        name: initialName || initialLabel.name,
        brand: initialLabel.brand,
        kcal: numField(initialLabel.kcal_100),
        protein: numField(initialLabel.protein_100),
        carbs: numField(initialLabel.carbs_100),
        fat: numField(initialLabel.fat_100),
        fiber: numField(initialLabel.fiber_100),
        sugar: numField(initialLabel.sugar_100),
        sodium: numField(initialLabel.sodium_100),
        serving_g: numField(initialLabel.serving_g),
      };
    }
    return {
      name: initialName,
      brand: '',
      kcal: '',
      protein: '',
      carbs: '',
      fat: '',
      fiber: '',
      sugar: '',
      sodium: '',
      serving_g: '',
    };
  });
  const [units, setUnits] = useState<CustomUnit[]>(food?.custom_units ?? []);
  const [newLabel, setNewLabel] = useState('');
  const [newGrams, setNewGrams] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suggestions update live as the user types the name (filtered to exclude
  // units they've already added).
  const suggestions = useMemo(
    () =>
      suggestPortions(form.name, form.brand).filter(
        (s) => !units.some((u) => u.label.toLowerCase() === s.label.toLowerCase()),
      ),
    [form.name, form.brand, units],
  );

  const handleLabelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setError(null);
    setScanning(true);
    try {
      const { label, error: scanError } = await analyzeLabel(file);
      if (!label) {
        setError(scanError ?? "Couldn't read that label.");
        return;
      }
      // Prefill from the transcribed label; keep an existing typed name.
      setForm((s) => ({
        name: s.name || label.name,
        brand: s.brand || label.brand,
        kcal: numField(label.kcal_100),
        protein: numField(label.protein_100),
        carbs: numField(label.carbs_100),
        fat: numField(label.fat_100),
        fiber: numField(label.fiber_100),
        sugar: numField(label.sugar_100),
        sodium: numField(label.sodium_100),
        serving_g: numField(label.serving_g),
      }));
    } finally {
      setScanning(false);
    }
  };

  const update = (k: keyof FormState, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const addUnit = () => {
    const grams = parseFloat(newGrams);
    if (!newLabel.trim() || !Number.isFinite(grams) || grams <= 0) return;
    setUnits((u) => [...u, { label: newLabel.trim(), grams }]);
    setNewLabel('');
    setNewGrams('');
  };

  const removeUnit = (label: string) => {
    setUnits((u) => u.filter((x) => x.label !== label));
  };

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Name is required');
    const kcal = parseFloat(form.kcal);
    const protein = parseFloat(form.protein);
    const carbs = parseFloat(form.carbs);
    const fat = parseFloat(form.fat);
    if (![kcal, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) {
      return setError('Calories and macros must be non-negative numbers');
    }
    const serving_g = form.serving_g ? parseFloat(form.serving_g) : undefined;
    if (serving_g !== undefined && (!Number.isFinite(serving_g) || serving_g <= 0)) {
      return setError('Serving size must be a positive number');
    }
    // Micronutrients are optional; a blank field stays undefined.
    const optNum = (v: string): number | undefined => {
      if (!v.trim()) return undefined;
      const n = parseFloat(v);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    setSaving(true);
    try {
      const fields = {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        kcal_100: kcal,
        protein_100: protein,
        carbs_100: carbs,
        fat_100: fat,
        fiber_100: optNum(form.fiber),
        sugar_100: optNum(form.sugar),
        sodium_100: optNum(form.sodium),
        serving_g,
        custom_units: units,
      };
      if (food) {
        await updateFood(food.id, fields);
        onCreated({ ...food, ...fields });
      } else {
        const created = await createFood({
          source: 'custom',
          off_barcode: initialBarcode,
          ...fields,
        });
        onCreated(created);
      }
    } finally {
      setSaving(false);
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
        <h2 className="mt-1 text-lg font-semibold">
          {isEdit ? 'Edit product' : 'Add a new product'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isEdit
            ? 'Changes apply to future logs; entries already in your diary keep their saved values.'
            : 'Saved to your foods library - always surfaces top of search.'}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {/* Scan or upload a nutrition label to auto-fill the macros below.
            No `capture` attribute: the OS picker then offers both the camera
            and the photo library, so a label already saved as a photo works
            just as well as a fresh snap. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleLabelFile(e)}
        />
        <Button
          type="button"
          variant="secondary"
          block
          disabled={scanning}
          onClick={() => fileInputRef.current?.click()}
        >
          {scanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading label…
            </>
          ) : (
            <>
              <ScanText className="h-4 w-4" />
              Scan or upload a nutrition label
            </>
          )}
        </Button>
        <p className="-mt-1 text-center text-[11px] text-muted-foreground">
          Snap the label or pick a photo and we'll fill in the macros - check them, name it, save.
        </p>

        <LabeledInput
          label="Name"
          required
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          autoFocus
        />
        <LabeledInput
          label="Brand (optional)"
          value={form.brand}
          onChange={(e) => update('brand', e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="kcal / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.kcal}
            onChange={(e) => update('kcal', e.target.value)}
            trailing="kcal"
          />
          <LabeledInput
            label="Protein / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.protein}
            onChange={(e) => update('protein', e.target.value)}
            trailing="g"
          />
          <LabeledInput
            label="Carbs / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.carbs}
            onChange={(e) => update('carbs', e.target.value)}
            trailing="g"
          />
          <LabeledInput
            label="Fat / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.fat}
            onChange={(e) => update('fat', e.target.value)}
            trailing="g"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <LabeledInput
            label="Fibre / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.fiber}
            onChange={(e) => update('fiber', e.target.value)}
            trailing="g"
          />
          <LabeledInput
            label="Sugar / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.sugar}
            onChange={(e) => update('sugar', e.target.value)}
            trailing="g"
          />
          <LabeledInput
            label="Sodium / 100g"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.sodium}
            onChange={(e) => update('sodium', e.target.value)}
            trailing="mg"
          />
        </div>

        <LabeledInput
          label="Serving size (optional)"
          type="number"
          inputMode="decimal"
          step="any"
          hint="Lets you log by serving as well as by grams."
          value={form.serving_g}
          onChange={(e) => update('serving_g', e.target.value)}
          trailing="g"
        />

        <div className="space-y-2">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Custom units (optional)
          </span>
          {units.length > 0 && (
            <ul className="space-y-1">
              {units.map((u) => (
                <li
                  key={u.label}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
                >
                  <span>
                    1 {u.label} = {u.grams} g
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUnit(u.label)}
                    aria-label={`Remove ${u.label}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">
                Suggested for this food - tap to add:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setUnits((prev) => [...prev, s])}
                    className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 active:scale-95 transition-transform"
                  >
                    <Plus className="h-3 w-3" />
                    {s.label} ({formatGrams(s.grams)} g)
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              placeholder="e.g. scoop"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Input
              placeholder="grams"
              type="number"
              inputMode="decimal"
              step="any"
              value={newGrams}
              onChange={(e) => setNewGrams(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={addUnit} aria-label="Add custom unit">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="mt-auto border-t border-border bg-card p-4">
        <Button
          type="button"
          variant="primary"
          block
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save product'}
        </Button>
      </div>
    </div>
  );
}
