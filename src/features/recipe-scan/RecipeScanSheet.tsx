import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardPaste, Loader2, RotateCcw, ScanLine } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { AiFeatureGate } from '@/features/settings/AiFeatureGate';
import { CaptureOverlay } from '@/features/food-search/CaptureOverlay';
import { RecipeReviewStep } from './RecipeReviewStep';
import {
  analyzeRecipePhoto,
  analyzeRecipeText,
  commitResolvedRecipe,
  resolveScannedRecipe,
  type ResolvedRecipe,
} from './recipeScan';

interface RecipeScanSheetProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'pick' | 'paste' | 'analyzing' | 'review' | 'error';

type ScanResult = Awaited<ReturnType<typeof analyzeRecipePhoto>>;

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
  const [pasted, setPasted] = useState('');

  const reset = () => {
    setPasted('');
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

  /** Shared tail of both inputs: show the result, or the error. */
  const finish = async ({ recipe, error: scanError }: ScanResult, kind: string) => {
    if (!recipe) {
      setError(scanError ?? `Could not read a recipe from that ${kind}.`);
      setPhase('error');
      return;
    }
    // Resolve to candidates and STOP. Everything used to be committed here,
    // sight unseen, which is how a wrong match reached the editor looking
    // exactly like a real ingredient.
    setResolved(await resolveScannedRecipe(recipe));
    setPhase('review');
  };

  const handleFile = async (file: Blob) => {
    setImageUrl(URL.createObjectURL(file));
    setPhase('analyzing');
    setError(null);
    await finish(await analyzeRecipePhoto(file), 'image');
  };

  /** A recipe that is already text skips the camera and its misreads. */
  const handleText = async () => {
    setImageUrl(null);
    setPhase('analyzing');
    setError(null);
    await finish(await analyzeRecipeText(pasted), 'text');
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
        maxDim={1600}
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
            You review every ingredient before the meal is created. Macros are
            AI estimates, so check them.
          </p>
          <Button type="button" variant="primary" onClick={() => setCameraOpen(true)}>
            <ScanLine className="h-4 w-4" />
            Open the camera
          </Button>
          <Button type="button" variant="secondary" onClick={() => setPhase('paste')}>
            <ClipboardPaste className="h-4 w-4" />
            Paste recipe text
          </Button>
          <p className="text-xs text-muted-foreground">
            If the recipe is already text (a message, a web page), pasting it
            is more accurate than a photo of it.
          </p>
        </div>
        </AiFeatureGate>
      )}

      {phase === 'paste' && (
        <div className="flex flex-col gap-3 p-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recipe text
            </span>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={12}
              autoFocus
              placeholder={'Tuscan chicken soup, 6 portions\n1 kg chicken thighs\n2 tins cannellini beans\n...'}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Include the name, how many portions it makes and the ingredients
            with their amounts. The method is optional.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setPhase('pick')}>
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              block
              disabled={pasted.trim().length < 10}
              onClick={() => void handleText()}
            >
              Read this recipe
            </Button>
          </div>
        </div>
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
