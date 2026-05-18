import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { formatKcal } from '@/lib/macros';
import {
  planPerServing,
  requestMealPlan,
  savePlanAsMeal,
  type MealPlanResult,
  type PlannedMeal,
} from './mealPlanner';

type Phase = 'form' | 'loading' | 'results';

export function MealPlannerPage() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('form');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [days, setDays] = useState(5);
  const [mealsPerDay, setMealsPerDay] = useState(1);
  const [kcalMax, setKcalMax] = useState('');
  const [proteinMin, setProteinMin] = useState('');
  const [notes, setNotes] = useState('');

  const [result, setResult] = useState<MealPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addIngredient = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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

  const removeIngredient = (name: string) =>
    setIngredients((curr) => curr.filter((c) => c !== name));

  const handleGenerate = async () => {
    setPhase('loading');
    setError(null);
    const res = await requestMealPlan({
      ingredients,
      days,
      mealsPerDay,
      kcalMax: kcalMax ? parseFloat(kcalMax) : undefined,
      proteinMin: proteinMin ? parseFloat(proteinMin) : undefined,
      notes: notes.trim() || undefined,
    });
    if (res.error && res.meals.length === 0) {
      setError(res.error);
      setPhase('form');
      return;
    }
    setResult(res);
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
            Building your meal plan… this usually takes 10–20 seconds.
          </p>
        </div>
      ) : phase === 'results' && result ? (
        <ResultsView
          result={result}
          onRestart={() => {
            setResult(null);
            setPhase('form');
          }}
          onGoToLibrary={() => navigate('/library')}
        />
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Set your targets and get meal-prep recipes you can save straight
            to your library. Add ingredients to build around — or leave them
            blank for free inspiration.
          </p>

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
                      onClick={() => removeIngredient(ing)}
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

          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Prep for"
              type="number"
              inputMode="numeric"
              min="1"
              value={Number.isFinite(days) ? days : ''}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              trailing="days"
            />
            <LabeledInput
              label="Meals per day"
              type="number"
              inputMode="numeric"
              min="1"
              value={Number.isFinite(mealsPerDay) ? mealsPerDay : ''}
              onChange={(e) => setMealsPerDay(parseInt(e.target.value, 10))}
            />
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

          <Button
            type="button"
            variant="primary"
            block
            onClick={handleGenerate}
          >
            <Sparkles className="h-4 w-4" />
            Generate plan
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Powered by free on-device AI — macros are estimates you can edit
            after saving.
          </p>
        </div>
      )}
    </div>
  );
}

function ResultsView({
  result,
  onRestart,
  onGoToLibrary,
}: {
  result: MealPlanResult;
  onRestart: () => void;
  onGoToLibrary: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {result.meals.length} meal{result.meals.length === 1 ? '' : 's'} suggested
        </h2>
        <Button type="button" size="sm" variant="ghost" onClick={onRestart}>
          New plan
        </Button>
      </div>

      {result.meals.map((meal, i) => (
        <MealSuggestionCard key={`${meal.name}-${i}`} meal={meal} />
      ))}

      {result.shoppingList.length > 0 && (
        <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            Shopping list ({result.shoppingList.length})
          </summary>
          <ul className="divide-y divide-border px-4 pb-3 text-sm">
            {result.shoppingList.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex justify-between gap-3 py-2">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-muted-foreground">{s.amount}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Button type="button" variant="secondary" block onClick={onGoToLibrary}>
        Done — go to library
      </Button>
    </div>
  );
}

function MealSuggestionCard({ meal }: { meal: PlannedMeal }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const per = planPerServing(meal);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePlanAsMeal(meal);
      setSaved(true);
      toast({ message: `"${meal.name}" saved to your library`, variant: 'success' });
    } catch {
      toast({ message: 'Could not save the meal — try again.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

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
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">
              {formatKcal(per.kcal)}
            </span>{' '}
            kcal/portion · {Math.round(per.protein)} P / {Math.round(per.carbs)} C /{' '}
            {Math.round(per.fat)} F · makes {Math.round(meal.servings)}
          </div>
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ingredients (whole batch)
            </div>
            <ul className="mt-1 divide-y divide-border text-sm">
              {meal.ingredients.map((ing, i) => (
                <li key={`${ing.name}-${i}`} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate">{ing.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {Math.round(ing.grams)} g · {formatKcal(ing.kcal)} kcal
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
        </div>
      )}
    </div>
  );
}
