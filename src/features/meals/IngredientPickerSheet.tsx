import { lazy, Suspense, useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Tabs } from '@/components/ui/Tabs';
import { FoodSearchPanel } from '@/features/food-search/FoodSearchPanel';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import { ManualEntryForm } from '@/features/food-search/ManualEntryForm';
import type { QuantityState, ResolvedMacros } from '@/features/food-search/foodMath';
import { lookupBarcode, OffRateLimitError } from '@/lib/off-api';
import { db } from '@/db/dexie';
import { currentUserId } from '@/db/userId';
import type { Food } from '@/db/types';
import type { MealItemInput } from '@/db/repos/meals';

// ZXing is ~600 kB; only load it when the Scan tab is opened.
const BarcodeScanner = lazy(() =>
  import('@/features/food-search/BarcodeScanner').then((m) => ({
    default: m.BarcodeScanner,
  })),
);

interface IngredientPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called once with the new ingredient input — caller appends to the meal. */
  onPicked: (item: MealItemInput, food: Food) => void;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'quantity'; food: Food }
  | { kind: 'manual'; presetName?: string; presetBarcode?: string };

type Tab = 'search' | 'scan';

export function IngredientPickerSheet({
  open,
  onClose,
  onPicked,
}: IngredientPickerSheetProps) {
  const [tab, setTab] = useState<Tab>('search');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [scanError, setScanError] = useState<string | null>(null);

  const reset = () => {
    setStep({ kind: 'pick' });
    setTab('search');
    setScanError(null);
  };
  const handleClose = () => {
    onClose();
    reset();
  };

  const handlePick = (food: Food) => setStep({ kind: 'quantity', food });
  const handleManualEntry = (name: string) =>
    setStep({ kind: 'manual', presetName: name || undefined });
  const handleManualCreated = (food: Food) =>
    setStep({ kind: 'quantity', food });

  const handleSave = (state: QuantityState, macros: ResolvedMacros) => {
    if (step.kind !== 'quantity') return;
    if (macros.grams <= 0) return;
    onPicked(
      { food_id: step.food.id, qty: state.qty, unit: macros.unit },
      step.food,
    );
    handleClose();
  };

  // Stable identity so BarcodeScanner's camera effect doesn't re-acquire.
  const handleBarcode = useCallback(async (code: string) => {
    setScanError(null);
    setStep({ kind: 'looking-up', barcode: code });
    try {
      // Use a library copy if we already have this barcode - instant, offline.
      const cached = await db.foods
        .where('user_id')
        .equals(currentUserId())
        .filter(
          (f) => !f.deleted_at && (f.id === `off:${code}` || f.off_barcode === code),
        )
        .first();
      if (cached) {
        setStep({ kind: 'quantity', food: cached });
        return;
      }
      const food = await lookupBarcode(code);
      if (food) {
        await db.foods.put(food);
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
          err instanceof Error
            ? err.message
            : 'Lookup failed. Try again or add manually.',
        );
      }
      setStep({ kind: 'manual', presetBarcode: code });
    }
  }, []);

  let title: string;
  let content: React.ReactNode;
  if (step.kind === 'pick') {
    title = 'Add ingredient';
    content = (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-3">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'search', label: 'Search' },
              { value: 'scan', label: 'Scan' },
            ]}
          />
        </div>
        {tab === 'search' && (
          <FoodSearchPanel
            section="snacks"
            onPick={handlePick}
            onManualEntry={handleManualEntry}
          />
        )}
        {tab === 'scan' && (
          <>
            {scanError && (
              <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {scanError}
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <BarcodeScanner onCode={handleBarcode} />
            </Suspense>
          </>
        )}
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
    title = step.food.name;
    content = (
      <QuantityStep
        food={step.food}
        saveLabel="Add ingredient"
        onBack={() => setStep({ kind: 'pick' })}
        onSave={handleSave}
      />
    );
  } else {
    title = 'New product';
    content = (
      <ManualEntryForm
        initialName={step.presetName}
        initialBarcode={step.presetBarcode}
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
