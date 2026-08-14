import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { aiUnavailableReason } from '@/features/settings/aiAvailability';
import { useProfile } from '@/db/repos/profile';
import { rememberAlias } from '@/db/repos/ingredientAliases';
import { IngredientCandidateSheet } from '@/features/food-search/IngredientCandidateSheet';
import { TIER_LABEL } from '@/features/food-search/ingredientMatch';
import type { Food } from '@/db/types';
import { formatKcal } from '@/lib/macros';
import {
  requestMealPlan,
  resetPlannerCaches,
  buildPlannerContext,
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
  const profile = useProfile();
  /** Index of the meal whose refine box is open. */
  const [refining, setRefining] = useState<number | null>(null);
  const [refineText, setRefineText] = useState('');

  /**
   * Per-meal targets suggested from the daily goal. Offered as chips rather
   * than prefilled, because a per-meal limit is not a daily one - you might
   * deliberately want a 200 kcal snack.
   */
  const kcalPresets = profile?.kcal_target
    ? [
        { label: 'Light', value: Math.round(profile.kcal_target * 0.15) },
        { label: 'Main', value: Math.round(profile.kcal_target / 3) },
        { label: 'Big', value: Math.round(profile.kcal_target * 0.45) },
      ]
    : [];
  const proteinPreset = profile?.protein_g
    ? Math.round(profile.protein_g / 3)
    : null;

  /** Refine one suggestion instead of rerolling all five. */
  const handleRefine = async (meal: PlannedMeal, instruction: string) => {
    if (!req || !instruction.trim()) return;
    setRefining(null);
    setRefineText('');
    setPhase('loading');
    setError(null);
    const res = await requestMealPlan({
      ...req,
      refine: { meal, instruction: instruction.trim() },
    });
    if (res.meals.length === 0) {
      setError(res.error ?? 'Could not refine that one - try again.');
      setPhase('results');
      return;
    }
    setMeals(res.meals);
    setPhase('results');
  };

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
    // Check before the request, not after: without a sync code this would
    // spin through a loading phase only to fail with the same message.
    const reason = aiUnavailableReason('use the AI meal planner');
    if (reason) {
      setError(reason);
      return;
    }
    setPhase('loading');
    setError(null);
    const request: MealPlanRequest = {
      portions: portions > 0 ? portions : 1,
      // Per-PORTION, never derived from the daily target: a 200 kcal snack
      // is a perfectly good ask. The profile only supplies the preset chips
      // and the background context below.
      kcalMax: kcalMax ? parseFloat(kcalMax) : undefined,
      proteinMin: proteinMin ? parseFloat(proteinMin) : undefined,
      context: await buildPlannerContext(profile),
      ingredients: ingredients.length > 0 ? ingredients : undefined,
      notes: notes.trim() || undefined,
    };
    const res = await requestMealPlan(request);
    if (res.meals.length === 0) {
      setError(res.error ?? 'Could not generate a plan - try again.');
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
        message: res.error ?? 'Could not get new meals - try again.',
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
            meal to see the recipe, scaled to hit your targets - then save it.
          </p>
          {meals.map((meal, i) => (
            <div key={`${meal.name}-${i}`} className="space-y-2">
              <MealCard meal={meal} req={req} />
              {/* Refine THIS one. Regenerating re-rolls all five and throws
                  away the one you liked, which is the difference between a
                  form and a conversation. */}
              {refining === i ? (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  <Input
                    autoFocus
                    placeholder="e.g. no mushrooms, make it spicier, no oven"
                    aria-label={`How should ${meal.name} change?`}
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRefine(meal, refineText);
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefining(null);
                        setRefineText('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      block
                      disabled={!refineText.trim()}
                      onClick={() => void handleRefine(meal, refineText)}
                    >
                      <Sparkles className="h-4 w-4" />
                      Redo with that change
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRefining(i);
                    setRefineText('');
                  }}
                  className="tap-target px-2 text-xs font-medium text-primary hover:underline"
                >
                  Like this, but change something…
                </button>
              )}
            </div>
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
            Done - go to library
          </Button>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Set your targets and get meal-prep recipes that actually fit them.
            Add ingredients to build around - or leave them blank for free
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
            <div className="space-y-1">
              <LabeledInput
                label="Max kcal / portion"
                type="number"
                inputMode="numeric"
                placeholder="optional"
                value={kcalMax}
                onChange={(e) => setKcalMax(e.target.value)}
              />
              {/* Suggestions from the daily goal, not a prefill: a per-meal
                  cap is not a daily one, and a 200 kcal snack is a real ask. */}
              {kcalPresets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {kcalPresets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setKcalMax(String(p.value))}
                      className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      {p.label} {p.value}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <LabeledInput
                label="Min protein / portion"
                type="number"
                inputMode="numeric"
                placeholder="optional"
                value={proteinMin}
                onChange={(e) => setProteinMin(e.target.value)}
                trailing="g"
              />
              {proteinPreset !== null && (
                <button
                  type="button"
                  onClick={() => setProteinMin(String(proteinPreset))}
                  className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:bg-muted"
                >
                  A third of your day: {proteinPreset}g
                </button>
              )}
            </div>
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
            Macros are looked up from real food data - free, on Cloudflare AI.
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
  const [picking, setPicking] = useState<number | null>(null);
  /** Ingredient name -> the food the user chose over the top match. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  /**
   * Re-fit the whole meal with the new food rather than patching one row:
   * the protein anchor and the calorie cap scale the amounts, so a swap can
   * legitimately change every quantity. Also teaches the alias, so this
   * ingredient resolves to their food everywhere from now on.
   */
  const applyOverride = (ingredientName: string, food: Food) => {
    setOverrides((o) => ({ ...o, [ingredientName]: food.id }));
    void rememberAlias(ingredientName, food.id);
  };

  useEffect(() => {
    let cancelled = false;
    void resolveAndFitMeal(meal, {
      portions: req.portions,
      kcalMax: req.kcalMax,
      proteinMin: req.proteinMin,
      overrides,
    }).then((r) => {
      if (!cancelled) setResolved(r);
    });
    return () => {
      cancelled = true;
    };
  }, [meal, req, overrides]);

  const handleSave = async () => {
    if (!resolved) return;
    setSaving(true);
    try {
      const { skipped } = await savePlanAsMeal(resolved);
      setSaved(true);
      toast({
        message:
          skipped.length > 0
            ? `"${meal.name}" saved - ${skipped.length} ingredient${skipped.length === 1 ? '' : 's'} had no nutrition data; add ${skipped.length === 1 ? 'it' : 'them'} in the meal editor`
            : `"${meal.name}" saved to your library`,
        variant: 'success',
      });
    } catch {
      toast({ message: 'Could not save the meal - try again.', variant: 'error' });
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
                {/* Which food each ingredient resolved to, and the ability to
                    change it. The planner used to take the top match silently
                    and save the meal, so wrong macros were invisible. */}
                <ul className="mt-1 divide-y divide-border text-sm">
                  {resolved.ingredients.map((ing, i) => (
                    <li key={`${ing.name}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setPicking(i)}
                        className="flex w-full items-center gap-3 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{ing.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {ing.food ? ing.food.name : 'No match - no nutrition data'}
                            {ing.food && ing.candidates[ing.chosen] && (
                              <> · {TIER_LABEL[ing.candidates[ing.chosen].tier]}</>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                          <span className="block">{Math.round(ing.grams)} g</span>
                          <span className="block text-[11px]">
                            {formatKcal(ing.perPortion.kcal * resolved.portions)} kcal
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
                {picking !== null && resolved.ingredients[picking] && (
                  <IngredientCandidateSheet
                    name={resolved.ingredients[picking].name}
                    grams={resolved.ingredients[picking].grams}
                    candidates={resolved.ingredients[picking].candidates}
                    chosen={resolved.ingredients[picking].chosen}
                    allowBlank={false}
                    onPick={(chosen) => {
                      const ing = resolved.ingredients[picking];
                      const food = chosen >= 0 ? ing.candidates[chosen]?.food : undefined;
                      if (food) applyOverride(ing.name, food);
                      setPicking(null);
                    }}
                    onPickFood={(food) => {
                      applyOverride(resolved.ingredients[picking].name, food);
                      setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                  />
                )}
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
