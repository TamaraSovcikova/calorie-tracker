import { useState } from 'react';
import { Camera, Check, ChevronRight, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { createDiaryEntry } from '@/db/repos/diary';
import { toast } from '@/components/ui/toast';
import { formatKcal } from '@/lib/macros';
import { cn } from '@/lib/cn';
import {
  analyzePhoto,
  repickPhotoFood,
  resolvePhotoFoods,
  type ResolvedPhotoFood,
} from './photoLog';
import { IngredientCandidateSheet } from '@/features/food-search/IngredientCandidateSheet';
import { CaptureOverlay } from '@/features/food-search/CaptureOverlay';
import { ALIAS_SCORE } from '@/features/food-search/ingredientMatch';
import { rememberAlias } from '@/db/repos/ingredientAliases';
import type { LocalDate } from '@/lib/dates';
import type { MealSection } from '@/db/types';

interface PhotoFoodStepProps {
  date: LocalDate;
  section: MealSection;
  /** Called after items are logged so the parent sheet can close. */
  onDone: () => void;
}

interface Row extends ResolvedPhotoFood {
  included: boolean;
}

type Phase = 'pick' | 'analyzing' | 'review' | 'error';

export function PhotoFoodStep({ date, section, onDone }: PhotoFoodStepProps) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  // The chooser already said what this does, so open the camera straight
  // away rather than showing a second explanation and asking for a second
  // tap. Closing the camera falls back to the panel below, which is then a
  // way back in rather than a gate.
  const [cameraOpen, setCameraOpen] = useState(true);

  /** Apply a candidate or amount change, recomputing that row's macros. */
  const repick = (index: number, chosen: number, grams?: number) => {
    setRows((rs) =>
      rs.map((x, i) =>
        i === index
          ? { ...repickPhotoFood(x, chosen, grams ?? x.grams), included: chosen >= 0 }
          : x,
      ),
    );
  };

  const handleFile = async (file: Blob) => {
    setImageUrl(URL.createObjectURL(file));
    setPhase('analyzing');
    setError(null);
    const analysis = await analyzePhoto(file);
    if (analysis.foods.length === 0) {
      setError(
        analysis.error ?? 'No food spotted in that photo - try another.',
      );
      setPhase('error');
      return;
    }
    const resolved = await resolvePhotoFoods(analysis.foods);
    setRows(resolved.map((r) => ({ ...r, included: !!r.food })));
    setPhase('review');
  };

  const chosen = rows.filter((r) => r.included && r.food && r.macros);

  const handleLog = async () => {
    setSaving(true);
    try {
      for (const r of chosen) {
        await createDiaryEntry({
          date,
          section,
          kind: 'food',
          food_id: r.food!.id,
          qty: r.grams,
          unit: 'g',
          kcal: r.macros!.kcal,
          protein: r.macros!.protein,
          carbs: r.macros!.carbs,
          fat: r.macros!.fat,
          fiber: r.macros!.fiber,
          sugar: r.macros!.sugar,
          sodium: r.macros!.sodium,
        });
      }
      toast({
        message: `${chosen.length} item${chosen.length === 1 ? '' : 's'} logged from your photo`,
        variant: 'success',
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setPhase('pick');
    setRows([]);
    setError(null);
    setImageUrl(null);
  };

  return (
    <div className="flex flex-col">
      {/* One camera for the whole app. This used to be `<input capture>`,
          which hands off to the OS camera app and on some Android builds
          offers no gallery at all. */}
      <CaptureOverlay
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(image) => {
          setCameraOpen(false);
          void handleFile(image);
        }}
        maxDim={1024}
        title="Photograph your meal"
        hint="Get the whole plate in frame, then tap the shutter."
        guide="none"
      />

      {phase === 'pick' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Camera className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            You confirm every item before anything is logged. Amounts are AI
            estimates, so check them.
          </p>
          <Button type="button" variant="primary" onClick={() => setCameraOpen(true)}>
            <Camera className="h-4 w-4" />
            Open the camera
          </Button>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="h-40 w-40 rounded-2xl object-cover"
            />
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysing your meal…
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="secondary" onClick={restart}>
            <RotateCcw className="h-4 w-4" />
            Try another photo
          </Button>
        </div>
      )}

      {phase === 'review' && (
        <>
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              )}
              <p className="text-sm text-muted-foreground">
                Tap to include or exclude. Amounts are estimates - edit any
                entry afterwards.
              </p>
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  <div className="flex items-center">
                    {/* Checkbox includes or excludes; the row body opens the
                        candidates. Before this, a wrong match could only be
                        excluded, never corrected - and this path writes
                        straight to the diary. */}
                    <button
                      type="button"
                      disabled={!r.food}
                      aria-label={r.included ? `Exclude ${r.name}` : `Include ${r.name}`}
                      onClick={() =>
                        setRows((rs) =>
                          rs.map((x, idx) =>
                            idx === i ? { ...x, included: !x.included } : x,
                          ),
                        )
                      }
                      className="tap-target flex shrink-0 items-center pl-3 pr-1 disabled:opacity-40"
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-md border',
                          r.included
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {r.included && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPicking(i)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-2 pr-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium capitalize">
                          {r.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.food ? r.food.name : 'Not recognised - tap to pick'}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {r.grams} g · {formatKcal(r.macros?.kcal ?? 0)} kcal
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {picking !== null && rows[picking] && (
            <IngredientCandidateSheet
              name={rows[picking].name}
              grams={rows[picking].grams}
              candidates={rows[picking].candidates}
              chosen={rows[picking].chosen}
              onPick={(chosen) => {
                repick(picking, chosen);
                setPicking(null);
              }}
              onPickFood={(food) => {
                // Same escape hatch as the recipe review: a product the
                // matcher could never suggest becomes reachable, and the pick
                // teaches the alias for next time.
                setRows((rs) =>
                  rs.map((x, i) => {
                    if (i !== picking) return x;
                    const at = x.candidates.findIndex((c) => c.food.id === food.id);
                    if (at >= 0) return { ...repickPhotoFood(x, at), included: true };
                    const withFood = {
                      ...x,
                      candidates: [
                        { food, tier: 'alias' as const, nameScore: 1, score: ALIAS_SCORE },
                        ...x.candidates,
                      ],
                    };
                    return { ...repickPhotoFood(withFood, 0), included: true };
                  }),
                );
                void rememberAlias(rows[picking].name, food.id);
                setPicking(null);
              }}
              onGramsChange={(grams) =>
                repick(picking, rows[picking].chosen, grams)
              }
              // A blank food here would log zero calories straight into the
              // diary, unlike the recipe editor where it can be filled in.
              allowBlank={false}
              onClose={() => setPicking(null)}
            />
          )}

          <div className="flex gap-2 border-t border-border bg-card p-4">
            <Button type="button" variant="ghost" onClick={restart} className="shrink-0">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="primary"
              block
              disabled={chosen.length === 0 || saving}
              onClick={handleLog}
            >
              {saving
                ? 'Logging…'
                : `Log ${chosen.length} item${chosen.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
