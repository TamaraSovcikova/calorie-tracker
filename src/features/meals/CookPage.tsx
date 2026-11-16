import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ChevronDown,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RotateCcw,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { pantryClass } from '@/features/food-search/ingredientMatch';
import { toast } from '@/components/ui/toast';
import { createMeal, replaceMealItems, updateMeal } from '@/db/repos/meals';
import { computeMacros, gramsForQuantity } from '@/features/food-search/foodMath';
import { formatKcal } from '@/lib/macros';
import { todayLocal } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { Food } from '@/db/types';
import { useMealResolved } from './useMealResolved';
import { itemToQuantity } from './mealMath';
import {
  batchName,
  fitToTarget,
  isBatch,
  portionOptions,
  roundAmount,
  scaleFactor,
  scaleForPortions,
  type FitLine,
  type FitResult,
  type PortionOption,
} from './batchMath';

interface Row {
  key: string;
  food_id: string;
  unit: string;
  /** Amount in the recipe as saved. */
  base: number;
  /** Amount for this cook. */
  qty: number;
  locked: boolean;
}

/** Parse a typed number, accepting a decimal comma. NaN when not a number. */
function num(text: string): number {
  return parseFloat(text.replace(',', '.'));
}

function trimNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function macrosFor(food: Food | undefined, row: Pick<Row, 'food_id' | 'qty' | 'unit'>) {
  if (!food) return { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };
  const state = itemToQuantity({
    id: '',
    meal_id: '',
    food_id: row.food_id,
    qty: row.qty,
    unit: row.unit,
  });
  return { ...computeMacros(food, state), grams: gramsForQuantity(food, state) };
}

/**
 * "Cook this": take a recipe, set it to what was actually bought, and save
 * the result as this week's batch.
 *
 * A recipe is three linked numbers: the food, the number of portions, and
 * what is in one portion. Change one and one of the others has to give, so
 * every control here says which:
 *  - Portions: more portions means more food, each portion unchanged. This
 *    is what "make 10 instead of 5" means everywhere else. A switch covers
 *    the other reading, the same food split differently.
 *  - Change a portion: "100 kcal more" lists the sensible ways to get
 *    there (more chicken, more rice, a bit more of everything) and the cook
 *    picks. Portions stay as they are.
 *  - Amounts: type what was actually bought; with "scale together" on the
 *    rest follow and the portions with them.
 *  - Exact targets: the solver, for hitting protein and calories at once.
 * Then save as a batch, leaving the recipe as it was.
 *
 * Opened on a batch instead of a recipe, it edits that batch in place.
 */
export function CookPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const resolved = useMealResolved(id);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [servings, setServings] = useState('');
  const [together, setTogether] = useState(true);
  // Off: changing portions scales the food. On: same food, re-split.
  const [resplit, setResplit] = useState(false);
  const [changeBy, setChangeBy] = useState<'kcal' | 'protein'>('kcal');
  const [changeAmount, setChangeAmount] = useState<number | null>(null);
  const [changeTo, setChangeTo] = useState('');
  const [moreOptions, setMoreOptions] = useState(false);
  const [exactOpen, setExactOpen] = useState(false);
  const [totalG, setTotalG] = useState('');
  const [targetProtein, setTargetProtein] = useState('');
  const [targetKcal, setTargetKcal] = useState('');
  const [fit, setFit] = useState<FitResult | null>(null);
  const [saving, setSaving] = useState(false);

  const source = resolved?.meal;
  // "Cook again" on a finished batch starts a NEW batch from its amounts.
  const [params] = useSearchParams();
  const again = params.get('again') === '1';
  const editingBatch = !!source && isBatch(source) && !again;

  // Seed the working copy once per meal. Later live updates to the recipe
  // must not wipe what is being typed.
  useEffect(() => {
    if (!resolved || rows !== null) return;
    const seeded: Row[] = resolved.items.map((it) => ({
      key: it.id,
      food_id: it.food_id,
      unit: it.unit,
      base: it.qty,
      qty: it.qty,
      locked: false,
    }));
    // The main protein source starts locked: the usual question is "the
    // meat is what it is, what do the sides need to be?".
    let top = -1;
    let topProtein = 0;
    seeded.forEach((r, i) => {
      const p = macrosFor(resolved.foodsById.get(r.food_id), r).protein;
      if (p > topProtein) {
        topProtein = p;
        top = i;
      }
    });
    if (top >= 0 && seeded.length > 1) seeded[top].locked = true;
    setRows(seeded);
    setServings(trimNum(resolved.servings));
    setTotalG(resolved.meal.total_g ? trimNum(resolved.meal.total_g) : '');
  }, [resolved, rows]);

  const foods = resolved?.foodsById;
  const portions = num(servings) > 0 ? num(servings) : 1;

  // Portion changes scale from a fixed starting point, not from the last
  // rounded result: stepping 5 -> 6 -> 5 must land back on the same
  // amounts, and rounding each step to a weighable number would drift.
  // Any other edit (an amount, an option, a fit) becomes the new start.
  const basis = useRef<{ qtys: number[]; portions: number } | null>(null);
  const scaling = useRef(false);
  useEffect(() => {
    if (!rows) return;
    if (scaling.current) {
      scaling.current = false;
      return;
    }
    basis.current = { qtys: rows.map((r) => r.qty), portions };
  }, [rows, portions]);

  const totals = useMemo(() => {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };
    for (const r of rows ?? []) {
      const m = macrosFor(foods?.get(r.food_id), r);
      t.kcal += m.kcal;
      t.protein += m.protein;
      t.carbs += m.carbs;
      t.fat += m.fat;
      t.grams += m.grams;
    }
    return t;
  }, [rows, foods]);

  if (resolved === undefined || (resolved && rows === null)) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!resolved || !source || !rows) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        This meal no longer exists.
        <Button className="mt-4" block onClick={() => navigate('/library')}>
          Back to library
        </Button>
      </div>
    );
  }

  const per = {
    kcal: totals.kcal / portions,
    protein: totals.protein / portions,
    carbs: totals.carbs / portions,
    fat: totals.fat / portions,
  };
  const changed =
    rows.some((r) => r.qty !== r.base) || portions !== resolved.servings;

  /** Commit a typed amount. With "together" on, everything else follows. */
  const commitQty = (index: number, text: string) => {
    const next = num(text);
    const row = rows[index];
    if (!(next > 0) || next === row.qty) return;
    setFit(null);
    if (!together) {
      setRows(rows.map((r, i) => (i === index ? { ...r, qty: next } : r)));
      return;
    }
    const f = scaleFactor(row.qty, next);
    setRows(
      rows.map((r, i) =>
        i === index ? { ...r, qty: next } : { ...r, qty: roundAmount(r.qty * f, r.unit) },
      ),
    );
    // More food at the same recipe is more portions, not bigger ones.
    setServings(trimNum(Math.round(portions * f * 10) / 10));
  };

  const toggleLock = (index: number) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, locked: !r.locked } : r)));

  const clearChange = () => {
    setChangeAmount(null);
    setChangeTo('');
    setMoreOptions(false);
  };

  const reset = () => {
    setRows(rows.map((r) => ({ ...r, qty: r.base })));
    setServings(trimNum(resolved.servings));
    setFit(null);
    clearChange();
  };

  /** Set the number of portions. Unless re-splitting, the food follows. */
  const commitPortions = (text: string) => {
    const next = num(text);
    if (!(next > 0)) {
      setServings(trimNum(portions));
      return;
    }
    setFit(null);
    if (!resplit && next !== portions) {
      const from = basis.current ?? { qtys: rows.map((r) => r.qty), portions };
      const scaled = scaleForPortions(
        rows.map((r, i) => ({ qty: from.qtys[i] ?? r.qty, unit: r.unit })),
        from.portions,
        next,
      );
      scaling.current = true;
      setRows(rows.map((r, i) => ({ ...r, qty: scaled[i] })));
    }
    setServings(trimNum(next));
  };

  // ---- Change a portion ----
  const optionLines = rows.map((r) => {
    const food = foods?.get(r.food_id);
    const m = macrosFor(food, r);
    return {
      qty: r.qty,
      unit: r.unit,
      kcal: m.kcal,
      protein: m.protein,
      negligible: !!food && pantryClass(food.name) === 'negligible',
    };
  });
  const perNow = changeBy === 'kcal' ? per.kcal : per.protein;
  // A typed target ("make it 600") is the same thing as a step from here.
  const typedDelta = num(changeTo) > 0 ? num(changeTo) - perNow : null;
  const delta = typedDelta ?? changeAmount;
  const options: PortionOption[] =
    delta && Math.abs(delta) >= (changeBy === 'kcal' ? 5 : 1)
      ? portionOptions(optionLines, portions, { [changeBy]: delta })
      : [];
  const shownOptions = moreOptions ? options : options.filter((o) => o.primary);
  const hiddenCount = options.length - options.filter((o) => o.primary).length;

  const applyOption = (o: PortionOption) => {
    setRows(rows.map((r, i) => ({ ...r, qty: o.qtys[i] })));
    setFit(null);
    clearChange();
  };

  const wantProtein = num(targetProtein);
  const wantKcal = num(targetKcal);
  const canFit = wantProtein > 0 || wantKcal > 0;

  const runFit = () => {
    const lines: FitLine[] = rows.map((r) => {
      const m = macrosFor(foods?.get(r.food_id), r);
      return { qty: r.qty, unit: r.unit, kcal: m.kcal, protein: m.protein, locked: r.locked };
    });
    const result = fitToTarget(lines, portions, {
      protein: wantProtein > 0 ? wantProtein : undefined,
      kcal: wantKcal > 0 ? wantKcal : undefined,
    });
    setRows(rows.map((r, i) => ({ ...r, qty: result.qtys[i] })));
    setFit(result);
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = rows
        .filter((r) => r.qty > 0)
        .map((r) => ({ food_id: r.food_id, qty: r.qty, unit: r.unit }));
      const weighed = num(totalG) > 0 ? num(totalG) : undefined;
      if (editingBatch) {
        await replaceMealItems(source.id, items);
        await updateMeal(source.id, { servings: portions, total_g: weighed ?? null });
        toast({ message: 'Batch updated', variant: 'success' });
      } else {
        const today = todayLocal();
        const created = await createMeal({
          name: batchName(source.name, format(new Date(), 'd MMM')),
          notes: source.notes,
          servings: portions,
          image_url: source.image_url,
          categories: source.categories ?? undefined,
          items,
          batch_date: today,
          batch_of: source.batch_of ?? source.id,
          total_g: weighed,
        });
        toast({ message: `${created.name} saved as a batch`, variant: 'success' });
      }
      navigate('/library');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/library')}
          aria-label="Back to library"
          className="tap-target flex items-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{source.name}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {editingBatch ? 'Adjust this batch' : 'Set it to what you bought'}
          </p>
        </div>
        {editingBatch && (
          <button
            type="button"
            onClick={() => navigate(`/meals/${source.id}/edit`)}
            className="tap-target rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
          >
            Details
          </button>
        )}
        {changed && (
          <button
            type="button"
            onClick={reset}
            aria-label="Reset amounts"
            className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="flex-1 space-y-4 p-4">
        {/* Result: always visible first, it is what every change is for. */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Per portion
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">
                  {formatKcal(per.kcal)}
                </span>
                <span className="text-sm text-muted-foreground">kcal</span>
              </div>
            </div>
            <div className="shrink-0 space-y-1">
              <span className="block text-right text-xs uppercase tracking-wide text-muted-foreground">
                Portions
              </span>
              <div className="flex items-center gap-1">
                <StepButton
                  label="One portion fewer"
                  disabled={portions <= 1}
                  onClick={() => commitPortions(String(Math.max(1, Math.ceil(portions) - 1)))}
                >
                  <Minus className="h-4 w-4" />
                </StepButton>
                <CommitInput
                  value={trimNum(portions)}
                  label="Portions this makes"
                  onCommit={commitPortions}
                  className="h-10 w-14 px-1 text-center tabular-nums"
                />
                <StepButton
                  label="One portion more"
                  onClick={() => commitPortions(String(Math.floor(portions) + 1))}
                >
                  <Plus className="h-4 w-4" />
                </StepButton>
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
            <div>Protein {Math.round(per.protein)} g</div>
            <div>Carbs {Math.round(per.carbs)} g</div>
            <div>Fat {Math.round(per.fat)} g</div>
          </div>
          <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground tabular-nums">
            Whole batch · {formatKcal(totals.kcal)} kcal · {Math.round(totals.protein)} g
            protein
            {changed && (
              <>
                {' · '}recipe was {formatKcal(resolved.totals.kcal)} kcal a portion
              </>
            )}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <Switch
              id="cook-resplit"
              checked={resplit}
              onChange={setResplit}
              label="Same food, split differently"
              description={
                resplit
                  ? 'Changing portions keeps the amounts and changes what is in each portion.'
                  : 'Changing portions scales the amounts. Each portion stays the same.'
              }
            />
          </div>
        </div>

        {/* Change a portion */}
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Change a portion</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick how much, then how. The number of portions stays at{' '}
              {trimNum(portions)}.
            </p>
          </div>
          <SegmentedControl<'kcal' | 'protein'>
            value={changeBy}
            onChange={(next) => {
              setChangeBy(next);
              clearChange();
            }}
            aria-label="Change a portion by"
            options={[
              { value: 'kcal', label: 'Calories' },
              { value: 'protein', label: 'Protein' },
            ]}
          />
          <div className="grid grid-cols-6 gap-1.5">
            {(changeBy === 'kcal' ? KCAL_STEPS : PROTEIN_STEPS).map((step) => (
              <button
                key={step}
                type="button"
                aria-pressed={changeAmount === step && typedDelta === null}
                onClick={() => {
                  setChangeTo('');
                  setMoreOptions(false);
                  setChangeAmount(changeAmount === step ? null : step);
                }}
                className={cn(
                  'tap-target rounded-full border px-0 text-center text-sm font-medium tabular-nums transition-colors',
                  changeAmount === step && typedDelta === null
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 hover:bg-muted',
                )}
              >
                {step > 0 ? '+' : '−'}
                {Math.abs(step)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            or make it
            <Input
              type="text"
              inputMode="decimal"
              aria-label={
                changeBy === 'kcal' ? 'Calories per portion to reach' : 'Protein per portion to reach'
              }
              placeholder={String(Math.round(perNow))}
              value={changeTo}
              onChange={(e) => {
                setChangeTo(e.target.value);
                setChangeAmount(null);
                setMoreOptions(false);
              }}
              className="h-9 w-20 px-2 text-right tabular-nums"
            />
            {changeBy === 'kcal' ? 'kcal' : 'g protein'}
          </label>

          {delta !== null && delta !== 0 && (
            <div className="space-y-2">
              {options.length === 0 ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  No single change gets there sensibly. Try a smaller step, or
                  change the amounts below by hand.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {shownOptions.map((o) => (
                    <OptionRow
                      key={o.kind === 'all' ? 'all' : `one-${o.index}`}
                      option={o}
                      name={
                        o.kind === 'one'
                          ? (foods?.get(rows[o.index as number].food_id)?.name ?? 'ingredient')
                          : null
                      }
                      row={o.kind === 'one' ? rows[o.index as number] : null}
                      portions={portions}
                      before={per}
                      onPick={() => applyOption(o)}
                    />
                  ))}
                </ul>
              )}
              {hiddenCount > 0 && !moreOptions && (
                <button
                  type="button"
                  onClick={() => setMoreOptions(true)}
                  className="tap-target w-full rounded-lg px-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
                >
                  Show {hiddenCount} more {hiddenCount === 1 ? 'option' : 'options'} (smaller
                  ingredients)
                </button>
              )}
            </div>
          )}
        </section>

        {/* Amounts */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Amounts
          </h2>
          <Switch
            id="cook-scale-together"
            checked={together}
            onChange={setTogether}
            label="Scale together"
            description={
              together
                ? 'Change one amount and the rest follow. The list doubles as a shopping list.'
                : 'Each amount changes on its own.'
            }
          />
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {rows.map((r, i) => {
              const food = foods?.get(r.food_id);
              const m = macrosFor(food, r);
              const delta = r.qty - r.base;
              return (
                <li
                  key={r.key}
                  className={cn('flex items-center gap-2 py-2 pr-3', exactOpen ? 'pl-1' : 'pl-3')}
                >
                  {exactOpen && (
                  <button
                    type="button"
                    onClick={() => toggleLock(i)}
                    aria-pressed={r.locked}
                    aria-label={
                      r.locked
                        ? `${food?.name ?? 'Ingredient'} is kept fixed when fitting. Tap to let it change.`
                        : `Keep ${food?.name ?? 'ingredient'} fixed when fitting`
                    }
                    className={cn(
                      'tap-target shrink-0 rounded-md p-2',
                      r.locked ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground',
                    )}
                  >
                    {r.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                  </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {food?.name ?? '(deleted food)'}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                      {formatKcal(m.kcal)} kcal · {Math.round(m.protein)} g protein
                    </div>
                    {delta !== 0 && (
                      <div className="truncate text-[11px] font-medium text-primary tabular-nums">
                        {delta > 0 ? '+' : '−'}
                        {trimNum(Math.abs(delta))} {r.unit} vs recipe ({trimNum(r.base)})
                      </div>
                    )}
                  </div>
                  <AmountInput
                    value={r.qty}
                    unit={r.unit}
                    label={`Amount of ${food?.name ?? 'ingredient'}`}
                    onCommit={(text) => commitQty(i, text)}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        {/* Fit */}
        <section className="rounded-2xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setExactOpen((v) => !v)}
            aria-expanded={exactOpen}
            className="tap-target flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
          >
            <Target className="h-4 w-4 text-primary" />
            <span className="flex-1">Exact targets</span>
            <ChevronDown
              className={cn('h-4 w-4 text-muted-foreground transition-transform', exactOpen && 'rotate-180')}
            />
          </button>
          {exactOpen && (
          <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Hit protein and calories per portion at the same time. Ingredients
            with a closed lock in the list above stay as they are, the rest are
            adjusted.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Protein"
              type="text"
              inputMode="decimal"
              placeholder={String(Math.round(per.protein))}
              value={targetProtein}
              onChange={(e) => setTargetProtein(e.target.value)}
              trailing="g"
            />
            <LabeledInput
              label="Calories"
              type="text"
              inputMode="decimal"
              placeholder={String(Math.round(per.kcal))}
              value={targetKcal}
              onChange={(e) => setTargetKcal(e.target.value)}
              trailing="kcal"
            />
          </div>
          <Button type="button" variant="secondary" block disabled={!canFit} onClick={runFit}>
            Fit amounts
          </Button>
          {fit && <FitNote fit={fit} />}
          </div>
          )}
        </section>

        <LabeledInput
          label="Cooked weight (optional)"
          type="text"
          inputMode="decimal"
          placeholder={String(Math.round(totals.grams))}
          value={totalG}
          onChange={(e) => setTotalG(e.target.value)}
          trailing="g"
          hint="Weigh the finished dish to log it by grams. Left empty, the raw ingredient weight is used."
        />
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button type="button" variant="primary" block disabled={saving} onClick={save}>
          {saving ? 'Saving…' : editingBatch ? 'Update batch' : 'Save as this week’s batch'}
        </Button>
        {!editingBatch && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            The recipe itself is not changed.
          </p>
        )}
      </div>
    </div>
  );
}

const KCAL_STEPS = [-200, -100, -50, 50, 100, 200];
const PROTEIN_STEPS = [-20, -10, -5, 5, 10, 20];

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="tap-target flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** A text field that reports its value on blur or Enter, not per key. */
function CommitInput({
  value,
  label,
  onCommit,
  className,
}: {
  value: string;
  label: string;
  onCommit: (text: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        if (num(text) > 0) onCommit(text);
        else setText(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={className}
    />
  );
}

/** One way to change the portion: what moves, by how much, what you get. */
function OptionRow({
  option,
  name,
  row,
  portions,
  before,
  onPick,
}: {
  option: PortionOption;
  name: string | null;
  row: Row | null;
  portions: number;
  before: { kcal: number; protein: number };
  onPick: () => void;
}) {
  const up = option.perPortion.kcal >= before.kcal;
  const signed = (n: number, unit: string) =>
    `${n >= 0 ? '+' : '−'}${trimNum(Math.abs(n))} ${unit}`;
  let title: string;
  let detail: string;
  if (option.kind === 'one' && row) {
    const total = option.qtys[option.index as number] - row.qty;
    title = `${up ? 'More' : 'Less'} ${name}`;
    detail = `${signed(Math.round((total / portions) * 10) / 10, row.unit)} a portion (${signed(total, row.unit)} in total)`;
  } else {
    title = up ? 'A bit more of everything' : 'A bit less of everything';
    detail = 'Same dish, every ingredient scaled';
  }
  const dProtein = Math.round(option.perPortion.protein - before.protein);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
            {detail}
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-sm font-semibold">
            {formatKcal(option.perPortion.kcal)} kcal
          </span>
          <span className="block text-xs text-muted-foreground">
            {Math.round(option.perPortion.protein)} g protein
            {dProtein !== 0 && ` (${dProtein > 0 ? '+' : '−'}${Math.abs(dProtein)})`}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Amount field that commits on blur or Enter rather than per keystroke.
 * With "scale together" on, a commit rescales the whole list, and doing
 * that for "9", "90", "900" as they are typed would wreck every other row.
 */
function AmountInput({
  value,
  unit,
  label,
  onCommit,
}: {
  value: number;
  unit: string;
  label: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(trimNum(value));
  useEffect(() => setText(trimNum(value)), [value]);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (num(text) > 0) onCommit(text);
          else setText(trimNum(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="h-10 w-20 px-2 text-right tabular-nums"
      />
      <span className="w-9 truncate text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function FitNote({ fit }: { fit: FitResult }) {
  const landed = `${formatKcal(fit.perPortion.kcal)} kcal and ${Math.round(fit.perPortion.protein)} g protein a portion`;
  if (!fit.changed && fit.missed.length === 0) {
    return <p className="text-xs text-muted-foreground">Already on target.</p>;
  }
  if (fit.missed.length === 0) {
    return (
      <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        Done: {landed}.
      </p>
    );
  }
  const what = fit.missed.includes('protein')
    ? fit.missed.includes('kcal')
      ? 'Could not reach either target'
      : 'Calories fit, protein does not'
    : 'Protein fits, calories do not';
  const fix = fit.missed.includes('protein')
    ? 'Unlock the protein, or add a leaner protein to the recipe.'
    : 'Unlock more ingredients, or change the number of portions.';
  return (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      {what}. Closest: {landed}. {fix}
    </p>
  );
}
