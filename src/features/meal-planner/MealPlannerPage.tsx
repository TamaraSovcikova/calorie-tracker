import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { formatKcal } from '@/lib/macros';
import {
  requestMealPlan,
  resetPlannerCaches,
  resolveAndFitMeal,
  savePlanAsMeal,
  type MealPlanRequest,
  type PlannedMeal,
  type ResolvedMeal,
} from './mealPlanner';

type Phase = 'form' | 'loading' | 'results';

export function MealPlannerPage() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('form');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [portions, setPortions] = useState(5);
  const [kcalMax, setKcalMax] = useState('');
  const [proteinMin, setProteinMin] = useState('');
  const [notes, setNotes] = useState('');

  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [req, setReq] = useState<MealPlanRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fresh recents + lookups each time the planner is opened.
  useEffect(() => {
    resetPlannerCaches();
  }, []);

  const addIngredient = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setIngredients((curr) => {
      const seen = new Set(curr.map((c) => c.toLowerCase()));
      const next = [...curr];
      for (const p of parts) {
        if (!seen.has(p.toLowerCase())) {
          seen.add(p.toLowerCase());
          next.push(p);
        }
      }
      return next;
    });
    setDraft('');
  };

  const handleGenerate = async () => {
    setPhase('loading');
    setError(null);
    const request: MealPlanRequest = {
      portions: portions > 0 ? portions : 1,
      kcalMax: kcalMax ? parseFloat(kcalMax) : undefined,
      proteinMin: proteinMin ? parseFloat(proteinMin) : undefined,
      ingredients: ingredients.length > 0 ? ingredients : undefined,
      notes: notes.trim() || undefined,
    };
    const res = await requestMealPlan(request);
    if (res.meals.length === 0) {
      setError(res.error ?? 'Could not generate a plan — try again.');
      setPhase('form');
      return;
    }
    setMeals(res.meals);
    setReq(request);
    setPhase('results');
  };

  const handleRegenerate = async () => {
    if (!req) return;
    setPhase('loading');
    const res = await requestMealPlan(req);
    if (res.meals.length === 0) {
      // Keep the meals already on screen; just report the hiccup.
      toast({
        message: res.error ?? 'Could not get new meals — try again.',
        variant: 'error',
      });
      setPhase('results');
      return;
    }
    setMeals(res.meals);
    setPhase('results');
  };

  return (
    <div className="mx-auto flex max-w-md flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="tap-target flex items-center gap-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back to library"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex flex-1 items-center gap-1.5 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Plan meals with AI
        </h1>
      </header>

      {phase === 'loading' ? (
        <div className="flex flex-col items-center gap-3 p-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Finding meal ideas… this usually takes 10–20 seconds.
          </p>
        </div>
      ) : phase === 'results' && req ? (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {meals.length} meal ideas
            </h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPhase('form')}
            >
              Edit requirements
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each makes {req.portions} portion{req.portions === 1 ? '' : 's'}. Tap a
            meal to see the recipe, scaled to hit your targets — then save it.
          </p>
          {meals.map((meal, i) => (
            <MealCard key={`${meal.name}-${i}`} meal={meal} req={req} />
          ))}
          <Button
            type="button"
            variant="secondary"
            block
            onClick={() => void handleRegenerate()}
          >
            <RefreshCw className="h-4 w-4" />
            Show me different meals
          </Button>
          <Button
            type="button"
            variant="ghost"
            block
            onClick={() => navigate('/library')}
          >
            Done — go to library
          </Button>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Set your targets and get meal-prep recipes that actually fit them.
            Add ingredients to build around — or leave them blank for free
            inspiration.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Portions to prep"
              type="number"
              inputMode="numeric"
              min="1"
              value={Number.isFinite(portions) ? portions : ''}
              onChange={(e) => setPortions(parseInt(e.target.value, 10))}
            />
            <div />
            <LabeledInput
              label="Max kcal / portion"
              type="number"
              inputMode="numeric"
              placeholder="optional"
              value={kcalMax}
              onChange={(e) => setKcalMax(e.target.value)}
            />
            <LabeledInput
              label="Min protein / portion"
              type="number"
              inputMode="numeric"
              placeholder="optional"
              value={proteinMin}
              onChange={(e) => setProteinMin(e.target.value)}
              trailing="g"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ingredients to use (optional)
            </span>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. chicken breast"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addIngredient(draft);
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => addIngredient(draft)}
                disabled={!draft.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {ingredients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ingredients.map((ing) => (
                  <span
                    key={ing}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                  >
                    {ing}
                    <button
                      type="button"
                      onClick={() =>
                        setIngredients((c) => c.filter((x) => x !== ing))
                      }
                      aria-label={`Remove ${ing}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <LabeledInput
            label="Notes (optional)"
            placeholder="e.g. vegetarian, no oven, low spice"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <Button type="button" variant="primary" block onClick={handleGenerate}>
            <Sparkles className="h-4 w-4" />
            Find meals
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Macros are looked up from real food data — free, on Cloudflare AI.
          </p>
        </div>
      )}
    </div>
  );
}

function MealCard({
  meal,
  req,
}: {
  meal: PlannedMeal;
  req: MealPlanRequest;
}) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<ResolvedMeal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveAndFitMeal(meal, {
      portions: req.portions,
      kcalMax: req.kcalMax,
      proteinMin: req.proteinMin,
    }).then((r) => {
      if (!cancelled) setResolved(r);
    });
    return () => {
      cancelled = true;
    };
  }, [meal, req]);

  const handleSave = async () => {
    if (!resolved) return;
    setSaving(true);
    try {
      await savePlanAsMeal(resolved);
      setSaved(true);
      toast({ message: `"${meal.name}" saved to your library`, variant: 'success' });
    } catch {
      toast({ message: 'Could not save the meal — try again.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const fits = resolved && resolved.fitsKcal && resolved.fitsProtein;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{meal.name}</div>
          {meal.description && (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {meal.description}
            </div>
          )}
          {!resolved ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking nutrition…
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">
                  {formatKcal(resolved.perPortion.kcal)}
                </span>{' '}
                kcal · {Math.round(resolved.perPortion.protein)} g protein /
                portion
              </span>
              <FitBadge fits={!!fits} />
            </div>
          )}
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {!resolved ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking up ingredients…
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Per portion
                </div>
                <div className="mt-0.5 text-sm font-medium tabular-nums">
                  {formatKcal(resolved.perPortion.kcal)} kcal ·{' '}
                  {Math.round(resolved.perPortion.protein)} P /{' '}
                  {Math.round(resolved.perPortion.carbs)} C /{' '}
                  {Math.round(resolved.perPortion.fat)} F
                </div>
                {!fits && (
                  <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    {!resolved.fitsKcal && 'Slightly over your kcal target. '}
                    {!resolved.fitsProtein && 'A little under your protein target.'}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Shopping list · whole batch ({resolved.portions} portions)
                </div>
                <ul className="mt-1 divide-y divide-border text-sm">
                  {resolved.ingredients.map((ing, i) => (
                    <li
                      key={`${ing.name}-${i}`}
                      className="flex justify-between gap-3 py-1.5"
                    >
                      <span className="truncate">
                        {ing.name}
                        {!ing.food && (
                          <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                            (no nutrition data)
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {ing.grams} g
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {meal.steps.length > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Method
                  </div>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
                    {meal.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <Button
                type="button"
                variant={saved ? 'secondary' : 'primary'}
                block
                disabled={saving || saved}
                onClick={handleSave}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : saved ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved to library
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Save to library
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FitBadge({ fits }: { fits: boolean }) {
  if (fits) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <Check className="h-3 w-3" />
        Fits targets
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3" />
      Close
    </span>
  );
}
