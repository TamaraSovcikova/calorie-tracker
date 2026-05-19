import { useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { createDiaryEntry } from '@/db/repos/diary';
import { toast } from '@/components/ui/toast';
import { formatKcal } from '@/lib/macros';
import { cn } from '@/lib/cn';
import {
  analyzePhoto,
  resolvePhotoFoods,
  type ResolvedPhotoFood,
} from './photoLog';
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
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setImageUrl(URL.createObjectURL(file));
    setPhase('analyzing');
    setError(null);
    const analysis = await analyzePhoto(file);
    if (analysis.foods.length === 0) {
      setError(
        analysis.error ?? 'No food spotted in that photo — try another.',
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
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
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
            <Camera className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Snap a photo of your meal and AI will identify the foods and
            estimate portions — you confirm before anything is logged.
          </p>
          <Button type="button" variant="primary" onClick={() => fileRef.current?.click()}>
            <Camera className="h-4 w-4" />
            Take or choose a photo
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Free, on Cloudflare AI. Estimates — always check them.
          </p>
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
                Tap to include or exclude. Amounts are estimates — edit any
                entry afterwards.
              </p>
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  {r.food ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((rs) =>
                          rs.map((x, idx) =>
                            idx === i ? { ...x, included: !x.included } : x,
                          ),
                        )
                      }
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                          r.included
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {r.included && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium capitalize">
                          {r.name}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {r.grams} g · {formatKcal(r.macros?.kcal ?? 0)} kcal
                        </span>
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5 opacity-60">
                      <span className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium capitalize">
                          {r.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Not recognised — add it from the Search tab.
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
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
