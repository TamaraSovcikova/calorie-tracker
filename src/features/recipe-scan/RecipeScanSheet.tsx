import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RotateCcw, ScanLine } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { analyzeRecipePhoto, resolveScannedRecipe } from './recipeScan';

interface RecipeScanSheetProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'pick' | 'analyzing' | 'error';

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
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase('pick');
    setError(null);
    setImageUrl(null);
  };
  const handleClose = () => {
    onClose();
    reset();
  };

  const handleFile = async (file: File) => {
    setImageUrl(URL.createObjectURL(file));
    setPhase('analyzing');
    setError(null);
    const { recipe, error: scanError } = await analyzeRecipePhoto(file);
    if (!recipe) {
      setError(scanError ?? 'Could not read a recipe from that image.');
      setPhase('error');
      return;
    }
    const resolved = await resolveScannedRecipe(recipe);
    handleClose();
    navigate('/meals/new', {
      state: {
        prefillItems: resolved.items,
        prefillName: resolved.name,
        prefillNotes: resolved.notes,
        prefillServings: resolved.servings,
      },
    });
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Scan a recipe">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {phase === 'pick' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ScanLine className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Choose a screenshot of a recipe — its ingredients (and method,
            if shown). AI reads it and opens a draft meal with estimated
            macros for you to review and save.
          </p>
          <Button type="button" variant="primary" onClick={() => fileRef.current?.click()}>
            <ScanLine className="h-4 w-4" />
            Choose a screenshot
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Free, on Cloudflare AI. Macros are estimates — edit anything.
          </p>
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

      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Try another screenshot
          </Button>
        </div>
      )}
    </Sheet>
  );
}
