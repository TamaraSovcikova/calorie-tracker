import { lazy, Suspense, useCallback, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FoodSearchPanel } from './FoodSearchPanel';
import { QuantityStep } from './QuantityStep';
import { ManualEntryForm } from './ManualEntryForm';
import { CaptureOverlay } from './CaptureOverlay';
import { CaptureChooser, type CaptureKind } from './CaptureChooser';
import { RecipeScanSheet } from '@/features/recipe-scan/RecipeScanSheet';
import { AiFeatureGate } from '@/features/settings/AiFeatureGate';
import { aiUnavailableReason } from '@/features/settings/aiAvailability';
import { analyzeLabel, type ScannedLabel } from './photoLabel';
import { QuickAddForm, type QuickAddValues } from './QuickAddForm';
import { formatKcal } from '@/lib/macros';

// ZXing is ~600 kB; only load it when the user opens the Scan tab.
const BarcodeScanner = lazy(() =>
  import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
);
import {
  customUnitFromMode,
  defaultQuantity,
  unitToQuantityState,
  type QuantityState,
  type ResolvedMacros,
} from './foodMath';
import { createDiaryEntry, lastQuantityForFood, recordFoodSeen } from '@/db/repos/diary';
import { maybeShowFoodFact } from '@/features/food-facts/foodFacts';
import { toast } from '@/components/ui/toast';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import { lookupBarcode, OffRateLimitError } from '@/lib/off-api';
import { MealPicker } from '@/features/meals/MealPicker';
import { LogMealStep } from '@/features/meals/LogMealStep';
import { PhotoFoodStep } from '@/features/photo-log/PhotoFoodStep';
import { multiplyTotals } from '@/features/meals/mealMath';
import { useMealResolved } from '@/features/meals/useMealResolved';
import { cn } from '@/lib/cn';
import type { LocalDate } from '@/lib/dates';
import { MEAL_SECTIONS } from '@/db/types';
import type { Food, Meal, MealSection } from '@/db/types';

interface AddFoodSheetProps {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  section: MealSection;
  /** When provided, a meal-section selector is shown in the picker header so
   *  the user can retarget the log (used by the quick-add route). */
  onSectionChange?: (section: MealSection) => void;
  /** Which tab to open on first render. Defaults to Search. */
  initialTab?: AddFoodTab;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'quantity'; food: Food; initial?: QuantityState }
  | { kind: 'meal-portion'; meal: Meal }
  | {
      kind: 'manual';
      presetName?: string;
      presetBarcode?: string;
      presetLabel?: ScannedLabel;
    };

/** Back out of a capture flow to the list of what the camera can do. */
function BackToCapture({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="tap-target flex items-center gap-1 px-4 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All capture options
    </button>
  );
}

/** Re-use the last logged quantity for a food, validated against the food's
 *  current units; falls back to a sensible default otherwise. */
function rememberedQuantity(
  food: Food,
  last: { qty: number; unit: string } | undefined,
): QuantityState {
  if (!last || !(last.qty > 0)) return defaultQuantity(food);
  const state = unitToQuantityState(last.qty, last.unit);
  if (state.mode === 'serving' && !(food.serving_g && food.serving_g > 0)) {
    return defaultQuantity(food);
  }
  if (state.mode.startsWith('unit:') && !customUnitFromMode(food, state.mode)) {
    return defaultQuantity(food);
  }
  return state;
}

/** 'scan' and 'photo' are kept as accepted values because the installed
 *  app's icon shortcuts point at them; both land on Capture. */
export type AddFoodTab = 'search' | 'capture' | 'scan' | 'photo' | 'meals' | 'quick';
type Tab = 'search' | 'capture' | 'meals' | 'quick';

/** Where a legacy tab name lands now. */
function normaliseTab(tab: AddFoodTab): {
  tab: Tab;
  capture?: CaptureKind;
} {
  if (tab === 'scan') return { tab: 'capture', capture: 'barcode' };
  if (tab === 'photo') return { tab: 'capture', capture: 'meal' };
  return { tab };
}

const SECTION_LABEL: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export function AddFoodSheet({
  open,
  onClose,
  date,
  section,
  onSectionChange,
  initialTab = 'search',
}: AddFoodSheetProps) {
  const initial = normaliseTab(initialTab);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [scanError, setScanError] = useState<string | null>(null);
  const [labelScanning, setLabelScanning] = useState(false);
  const [labelCaptureOpen, setLabelCaptureOpen] = useState(false);
  /** Which capture flow is open, or null for the chooser. */
  const [capture, setCapture] = useState<CaptureKind | null>(
    initial.capture ?? null,
  );
  const [recipeOpen, setRecipeOpen] = useState(false);

  const reset = () => {
    setStep({ kind: 'pick' });
    setTab(initial.tab);
    setCapture(initial.capture ?? null);
    setScanError(null);
  };

  const pickCapture = (kind: CaptureKind) => {
    if (kind === 'recipe') {
      setRecipeOpen(true);
      return;
    }
    if (kind === 'label') {
      const reason = aiUnavailableReason('scan nutrition labels');
      if (reason) {
        setScanError(reason);
        return;
      }
      setLabelCaptureOpen(true);
      return;
    }
    setScanError(null);
    setCapture(kind);
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  const handlePick = async (food: Food) => {
    const last = await lastQuantityForFood(food.id);
    setStep({ kind: 'quantity', food, initial: rememberedQuantity(food, last) });
  };
  const handleManualEntry = (name: string) =>
    setStep({ kind: 'manual', presetName: name || undefined });
  const handleManualCreated = (food: Food) =>
    setStep({ kind: 'quantity', food });
  const handlePickMeal = (meal: Meal) =>
    setStep({ kind: 'meal-portion', meal });

  const handleQuickAdd = async (v: QuickAddValues) => {
    await createDiaryEntry({
      date,
      section,
      kind: 'quick',
      name: v.name,
      qty: 1,
      unit: 'kcal',
      kcal: v.kcal,
      protein: v.protein,
      carbs: v.carbs,
      fat: v.fat,
      fiber: 0,
      sugar: 0,
      sodium: 0,
    });
    toast({
      message: `${v.name ? `${v.name} · ` : ''}${formatKcal(v.kcal)} kcal added to ${SECTION_LABEL[section]}`,
      variant: 'success',
    });
    handleClose();
  };

  const handleSaveQuantity = async (state: QuantityState, macros: ResolvedMacros) => {
    if (step.kind !== 'quantity') return;
    if (macros.grams <= 0) return;
    const loggedFood = step.food;
    const foodName = loggedFood.name;
    await createDiaryEntry({
      date,
      section,
      kind: 'food',
      food_id: step.food.id,
      qty: state.qty,
      unit: macros.unit,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
      sugar: macros.sugar,
      sodium: macros.sodium,
    });
    toast({
      message: `${foodName} added to ${SECTION_LABEL[section]}`,
      variant: 'success',
    });
    // Occasionally surface a nutrition fact about what was just logged.
    void maybeShowFoodFact(loggedFood);
    // Stay open on the search panel so several items can be logged in a row.
    setStep({ kind: 'pick' });
    setTab('search');
    setScanError(null);
  };

  // Stable identity - BarcodeScanner has this in its camera-effect deps,
  // so a fresh closure each render would tear down and re-acquire the
  // camera stream (flicker). Only stable setState calls are referenced.
  const handleBarcode = useCallback(async (code: string) => {
    setScanError(null);
    setStep({ kind: 'looking-up', barcode: code });
    try {
      // Already in the library (scanned before / cached)? Use it - instant,
      // works offline, and skips a redundant OFF call against the rate limit.
      const cached = await db.foods
        .where('user_id')
        .equals(currentUserId())
        .filter(
          (f) => !f.deleted_at && (f.id === `off:${code}` || f.off_barcode === code),
        )
        .first();
      if (cached) {
        // A scan counts as "recently seen" even if the user never logs it.
        void recordFoodSeen(cached.id);
        setStep({ kind: 'quantity', food: cached });
        return;
      }
      const food = await lookupBarcode(code);
      if (food) {
        await db.foods.put(food);
        void recordFoodSeen(food.id);
        setStep({ kind: 'quantity', food });
        return;
      }
      setStep({ kind: 'manual', presetBarcode: code });
    } catch (err) {
      if (err instanceof OffRateLimitError) {
        setScanError(
          `Open Food Facts rate limit hit. Try again in ${Math.ceil(err.retryAfterMs / 1000)}s, or add it manually.`,
        );
      } else {
        setScanError(
          err instanceof Error ? err.message : 'Lookup failed. Try again or add manually.',
        );
      }
      setStep({ kind: 'manual', presetBarcode: code });
    }
  }, []);

  // Scan tab shortcut: read a nutrition label photo, then drop into the
  // new-product form pre-filled with the transcribed macros.
  const handleLabelImage = async (image: Blob) => {
    setLabelCaptureOpen(false);
    setScanError(null);
    setLabelScanning(true);
    try {
      const { label, error } = await analyzeLabel(image);
      if (!label) {
        setScanError(error ?? "Couldn't read that label. Try again or add it manually.");
        return;
      }
      setStep({ kind: 'manual', presetLabel: label });
    } finally {
      setLabelScanning(false);
    }
  };

  let title: string;
  let content: React.ReactNode;
  if (step.kind === 'pick') {
    title = 'Add food';
    content = (
      <div className="flex h-full flex-col">
        <div className="space-y-3 border-b border-border p-3">
          {onSectionChange && (
            <div className="flex overflow-hidden rounded-lg border border-border">
              {MEAL_SECTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSectionChange(s)}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium transition-colors',
                    s === section ? 'text-white' : 'text-muted-foreground hover:bg-muted',
                  )}
                  style={s === section ? { background: 'var(--color-accent-deep)' } : undefined}
                >
                  {SECTION_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'search', label: 'Search' },
              { value: 'capture', label: 'Capture' },
              { value: 'meals', label: 'Meals' },
              { value: 'quick', label: 'Quick' },
            ]}
          />
        </div>
        {tab === 'search' && (
          <FoodSearchPanel
            section={section}
            onPick={handlePick}
            onManualEntry={handleManualEntry}
            onPickMeal={handlePickMeal}
          />
        )}
        {tab === 'capture' && (
          <>
            {scanError && (
              <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {scanError}
              </div>
            )}
            {labelScanning && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading label…
              </div>
            )}
            <CaptureOverlay
              open={labelCaptureOpen}
              onClose={() => setLabelCaptureOpen(false)}
              onCapture={(image) => void handleLabelImage(image)}
            />
            <RecipeScanSheet
              open={recipeOpen}
              onClose={() => setRecipeOpen(false)}
            />

            {capture === null && <CaptureChooser onPick={pickCapture} />}

            {capture === 'barcode' && (
              <>
                <BackToCapture onBack={() => setCapture(null)} />
                <Suspense
                  fallback={
                    <div className="flex flex-1 items-center justify-center p-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <BarcodeScanner
                    onCode={handleBarcode}
                    onScanLabel={() => pickCapture('label')}
                  />
                </Suspense>
              </>
            )}

            {capture === 'meal' && (
              <>
                <BackToCapture onBack={() => setCapture(null)} />
                <AiFeatureGate feature="log meals from a photo">
                  <PhotoFoodStep date={date} section={section} onDone={handleClose} />
                </AiFeatureGate>
              </>
            )}
          </>
        )}
        {tab === 'meals' && <MealPicker onPick={handlePickMeal} />}
        {tab === 'quick' && <QuickAddForm onSave={handleQuickAdd} />}
      </div>
    );
  } else if (step.kind === 'looking-up') {
    title = 'Looking up…';
    content = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-sm">
          Searching Open Food Facts for{' '}
          <span className="font-mono">{step.barcode}</span>
        </div>
      </div>
    );
  } else if (step.kind === 'quantity') {
    title = 'Add quantity';
    content = (
      <QuantityStep
        food={step.food}
        initial={step.initial}
        onBack={() => setStep({ kind: 'pick' })}
        onSave={handleSaveQuantity}
      />
    );
  } else if (step.kind === 'meal-portion') {
    title = 'Log meal';
    content = (
      <MealPortionStep
        meal={step.meal}
        date={date}
        section={section}
        onBack={() => setStep({ kind: 'pick' })}
        onDone={() => {
          setStep({ kind: 'pick' });
          setTab('meals');
        }}
      />
    );
  } else {
    title = 'New product';
    content = (
      <ManualEntryForm
        initialName={step.presetName}
        initialBarcode={step.presetBarcode}
        initialLabel={step.presetLabel}
        onBack={() => setStep({ kind: 'pick' })}
        onCreated={handleManualCreated}
      />
    );
  }

  return (
    <Sheet open={open} onClose={handleClose} title={title}>
      {content}
    </Sheet>
  );
}

/**
 * Inner component so the useMealResolved hook only runs when actually
 * showing the meal-portion step. Saves the diary entry with the meal's
 * totals scaled by the chosen multiplier.
 */
function MealPortionStep({
  meal,
  date,
  section,
  onBack,
  onDone,
}: {
  meal: Meal;
  date: LocalDate;
  section: MealSection;
  onBack: () => void;
  onDone: () => void;
}) {
  const resolved = useMealResolved(meal.id);
  const handleSave = async (multiplier: number) => {
    if (!resolved) return;
    const totals = multiplyTotals(resolved.totals, multiplier);
    await createDiaryEntry({
      date,
      section,
      kind: 'meal',
      meal_id: meal.id,
      qty: multiplier,
      unit: 'serving',
      portion_multiplier: multiplier,
      kcal: totals.kcal,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      fiber: totals.fiber,
      sugar: totals.sugar,
      sodium: totals.sodium,
    });
    toast({
      message: `${meal.name} added to ${SECTION_LABEL[section]}`,
      variant: 'success',
    });
    onDone();
  };
  return <LogMealStep mealId={meal.id} onBack={onBack} onSave={handleSave} />;
}
