import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RotateCcw, ScanLine } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { AiFeatureGate } from '@/features/settings/AiFeatureGate';
import { CaptureOverlay } from '@/features/food-search/CaptureOverlay';
import { RecipeReviewStep } from './RecipeReviewStep';
import {
  analyzeRecipePhoto,
  commitResolvedRecipe,
  resolveScannedRecipe,
  type ResolvedRecipe,
} from './recipeScan';

interface RecipeScanSheetProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'pick' | 'analyzing' | 'review' | 'error';

/**
 * Fast-lane meal insert: pick a screenshot of a recipe, AI reads the
 * ingredients (and method, if shown), and it opens pre-filled in the meal
 * editor for a quick review before saving.
 */
export function RecipeScanSheet({ open, onClose }: RecipeScanSheetProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const reset = () => {
    setPhase('pick');
    setError(null);
    setImageUrl(null);
    setResolved(null);
    setSaving(false);
  };
  const handleClose = () => {
    onClose();
    reset();
  };

  const handleFile = async (file: Blob) => {
    setImageUrl(URL.createObjectURL(file));
    setPhase('analyzing');
    setError(null);
    const { recipe, error: scanError } = await analyzeRecipePhoto(file);
    if (!recipe) {
      setError(scanError ?? 'Could not read a recipe from that image.');
      setPhase('error');
      return;
    }
    // Resolve to candidates and STOP. Everything used to be committed here,
    // sight unseen, which is how a wrong match reached the editor looking
    // exactly like a real ingredient.
    setResolved(await resolveScannedRecipe(recipe));
    setPhase('review');
  };

  const handleConfirm = async () => {
    if (!resolved) return;
    setSaving(true);
    try {
      const items = await commitResolvedRecipe(resolved);
      handleClose();
      navigate('/meals/new', {
        state: {
          prefillItems: items,
          prefillName: resolved.name,
          prefillNotes: resolved.notes,
          prefillServings: resolved.servings,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Scan a recipe">
      {/* Was gallery-only, so a cookbook or a magazine page could not be
          scanned at all - only a screenshot you already had. The shared
          overlay gives it a camera AND the gallery. */}
      <CaptureOverlay
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(image) => {
          setCameraOpen(false);
          void handleFile(image);
        }}
        title="Scan a recipe"
        hint="Fit the ingredients list in frame, then tap the shutter."
        guide="landscape"
      />

      {phase === 'pick' && (
        <AiFeatureGate feature="scan recipes">
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ScanLine className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Photograph a recipe page, or pick a screenshot of one. AI reads the
            ingredients (and the method, if shown) and opens a draft meal with
            estimated macros for you to review and save.
          </p>
          <Button type="button" variant="primary" onClick={() => setCameraOpen(true)}>
            <ScanLine className="h-4 w-4" />
            Scan a recipe
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Free, on Cloudflare AI. Macros are estimates - edit anything.
          </p>
        </div>
        </AiFeatureGate>
      )}

      {phase === 'analyzing' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="max-h-48 rounded-2xl object-contain"
            />
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading the recipe…
          </div>
        </div>
      )}

      {phase === 'review' && resolved && (
        <RecipeReviewStep
          recipe={resolved}
          onChange={setResolved}
          onConfirm={() => void handleConfirm()}
          saving={saving}
        />
      )}

      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Try another
          </Button>
        </div>
      )}
    </Sheet>
  );
}
