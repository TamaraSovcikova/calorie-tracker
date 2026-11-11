import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { findFoodByBarcode } from '@/features/food-search/barcodeLookup';
import { recordFoodSeen } from '@/db/repos/diary';
import { Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FoodSearchPanel } from '@/features/food-search/FoodSearchPanel';
import { QuantityStep } from '@/features/food-search/QuantityStep';
import { ManualEntryForm } from '@/features/food-search/ManualEntryForm';
import { CaptureOverlay } from '@/features/food-search/CaptureOverlay';
import { CaptureChooser, type CaptureKind } from '@/features/food-search/CaptureChooser';
import { aiUnavailableReason } from '@/features/settings/aiAvailability';
import { analyzeLabel, type ScannedLabel } from '@/features/food-search/photoLabel';
import type { QuantityState, ResolvedMacros } from '@/features/food-search/foodMath';
import { OffRateLimitError } from '@/lib/off-api';
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
  /** Called once with the new ingredient input - caller appends to the meal. */
  onPicked?: (item: MealItemInput, food: Food) => void;
  /**
   * Pick a product only, with no amount step. The whole of this sheet
   * (search, barcode, label scan, manual entry) is exactly what choosing a
   * product for the compare tool needs, minus "how much".
   */
  onFood?: (food: Food) => void;
  /** Sheet title on the first step. */
  title?: string;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'looking-up'; barcode: string }
  | { kind: 'quantity'; food: Food }
  | {
      kind: 'manual';
      presetName?: string;
      presetBarcode?: string;
      presetLabel?: ScannedLabel;
    };

type Tab = 'search' | 'capture';

export function IngredientPickerSheet({
  open,
  onClose,
  onPicked,
  onFood,
  title: pickTitle = 'Add ingredient',
}: IngredientPickerSheetProps) {
  const [tab, setTab] = useState<Tab>('search');
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [scanError, setScanError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelScanning, setLabelScanning] = useState(false);

  const reset = () => {
    setStep({ kind: 'pick' });
    setTab('search');
    setCapture(null);
    setScanError(null);
  };

  // Building a meal, so only the two that produce ONE ingredient are on
  // offer: a meal photo logs to the diary and a recipe makes a whole meal.
  const pickCapture = (kind: CaptureKind) => {
    if (kind === 'label') {
      const reason = aiUnavailableReason('scan nutrition labels');
      if (reason) {
        setScanError(reason);
        return;
      }
      setLabelOpen(true);
      return;
    }
    setScanError(null);
    setCapture(kind);
  };

  const handleLabelImage = async (image: Blob) => {
    setLabelOpen(false);
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
  const handleClose = () => {
    onClose();
    reset();
  };

  /** A product was chosen: hand it straight back, or go on to the amount. */
  const choose = (food: Food) => {
    if (onFood) {
      void recordFoodSeen(food.id);
      onFood(food);
      handleClose();
      return;
    }
    setStep({ kind: 'quantity', food });
  };
  // handleBarcode has to keep a stable identity (see below), so it reaches
  // the current `choose` through a ref.
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  const handlePick = choose;
  const handleManualEntry = (name: string) =>
    setStep({ kind: 'manual', presetName: name || undefined });
  const handleManualCreated = choose;

  const handleSave = (state: QuantityState, macros: ResolvedMacros) => {
    if (step.kind !== 'quantity') return;
    if (macros.grams <= 0) return;
    void recordFoodSeen(step.food.id);
    onPicked?.(
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
      const food = await findFoodByBarcode(code);
      if (food) {
        chooseRef.current(food);
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
    title = pickTitle;
    content = (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-3">
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'search', label: 'Search' },
              { value: 'capture', label: 'Capture' },
            ]}
          />
        </div>
        {tab === 'search' && (
          <FoodSearchPanel
            onPick={handlePick}
            onManualEntry={handleManualEntry}
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
              open={labelOpen}
              onClose={() => setLabelOpen(false)}
              onCapture={(image) => void handleLabelImage(image)}
            />
            {capture === null && (
              <CaptureChooser onPick={pickCapture} omit={['meal', 'recipe']} />
            )}
            {capture === 'barcode' && (
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
            )}
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
