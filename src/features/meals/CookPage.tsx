import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, LabeledInput } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
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
  /** Kept fixed by the exact-targets solver. */
  locked: boolean;
}

type SheetState =
  | null
  | { kind: 'portions' }
  | { kind: 'change' }
  | { kind: 'amount'; index: number }
  | { kind: 'more' };

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

function totalsOf(rows: Row[], foods: Map<string, Food> | undefined) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 };
  for (const r of rows) {
    const m = macrosFor(foods?.get(r.food_id), r);
    t.kcal += m.kcal;
    t.protein += m.protein;
    t.carbs += m.carbs;
    t.fat += m.fat;
    t.grams += m.grams;
  }
  return t;
}

/** How far one tap of + or - moves an amount. */
function nudgeStep(qty: number, unit: string): number {
  if (unit !== 'g' && unit !== 'ml') return qty < 2 ? 0.5 : 1;
  if (qty < 50) return 5;
  if (qty < 200) return 10;
  if (qty < 1000) return 50;
  return 100;
}

const amountLabel = (qty: number, unit: string) => `${trimNum(qty)} ${unit}`;

/**
 * "Cook this": take a recipe, set it to what is actually being cooked, and
 * save the result as this week's batch.
 *
 * A recipe is three linked numbers: the food, the number of portions, and
 * what is in one portion. Change one and one of the others has to give.
 * The screen is built so that is never decided silently:
 *
 *  - The two numbers at the top stay on screen and ARE the controls.
 *    Tap Portions: more or fewer, and right there, whether the food scales
 *    with it or the same food is split differently.
 *    Tap Per portion: "100 kcal more" lists the sensible ways to get there.
 *  - The list is just the ingredients. + and - move one. Tapping an amount
 *    asks, at that moment, "just this" or "scale the whole recipe".
 *
 * An earlier version had these as two always-on switches and four stacked
 * cards. The switches were modes that got forgotten, and the calories being
 * edited scrolled off the top. Asking the question at the moment it matters
 * removed both.
 *
 * Opened on a batch instead of a recipe, it edits that batch in place.
 */
export function CookPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const resolved = useMealResolved(id);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [portions, setPortions] = useState(1);
  const [totalG, setTotalG] = useState('');
  const [sheet, setSheet] = useState<SheetState>(null);
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
    // For the solver, the main protein source starts locked: the usual
    // question is "the meat is what it is, what do the sides need to be?".
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
    setPortions(resolved.servings);
    setTotalG(resolved.meal.total_g ? trimNum(resolved.meal.total_g) : '');
  }, [resolved, rows]);

  const foods = resolved?.foodsById;
  const totals = useMemo(() => totalsOf(rows ?? [], foods), [rows, foods]);

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

  const per = { kcal: totals.kcal / portions, protein: totals.protein / portions };
  const changed = rows.some((r) => r.qty !== r.base) || portions !== resolved.servings;
  const nameOf = (r: Row) => foods?.get(r.food_id)?.name ?? '(deleted food)';
  const close = () => setSheet(null);

  const reset = () => {
    setRows(rows.map((r) => ({ ...r, qty: r.base })));
    setPortions(resolved.servings);
  };

  const nudge = (index: number, dir: 1 | -1) => {
    const r = rows[index];
    const step = nudgeStep(r.qty, r.unit);
    const next = Math.max(step, Math.round((r.qty + dir * step) * 100) / 100);
    setRows(rows.map((x, i) => (i === index ? { ...x, qty: next } : x)));
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
        const created = await createMeal({
          name: batchName(source.name, format(new Date(), 'd MMM')),
          notes: source.notes,
          servings: portions,
          image_url: source.image_url,
          categories: source.categories ?? undefined,
          items,
          batch_date: todayLocal(),
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
      {/* Header and summary stay put: the numbers being changed are always
          in view, whatever is being edited below. */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <header className="flex items-center gap-2 px-3 pt-3">
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
              {editingBatch ? 'Adjust this batch' : 'Tap a number to change it'}
            </p>
          </div>
          {changed && (
            <button
              type="button"
              onClick={reset}
              aria-label="Reset to the recipe"
              className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          )}
        </header>

        <div className="space-y-2 px-4 pb-3 pt-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSheet({ kind: 'portions' })}
              className="w-28 shrink-0 rounded-2xl border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Portions
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums">{trimNum(portions)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSheet({ kind: 'change' })}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted"
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Per portion
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums">{formatKcal(per.kcal)}</span>
                <span className="text-sm text-muted-foreground">kcal</span>
                <span className="truncate text-xs text-muted-foreground tabular-nums">
                  · {Math.round(per.protein)} g protein
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              </span>
            </button>
          </div>
          <p className="px-1 text-xs text-muted-foreground tabular-nums">
            Whole batch · {formatKcal(totals.kcal)} kcal · {Math.round(totals.protein)} g protein
            {changed && ` · recipe was ${formatKcal(resolved.totals.kcal)} kcal a portion`}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-2 p-4">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          What goes in
        </h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {rows.map((r, i) => {
            const m = macrosFor(foods?.get(r.food_id), r);
            const delta = Math.round((r.qty - r.base) * 100) / 100;
            const name = nameOf(r);
            return (
              <li key={r.key} className="flex items-center gap-1.5 py-2 pl-3.5 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="truncate text-xs text-muted-foreground tabular-nums">
                    {formatKcal(m.kcal)} kcal · {Math.round(m.protein)} g protein
                  </div>
                  {delta !== 0 && (
                    <div className="truncate text-[11px] font-medium text-primary tabular-nums">
                      {delta > 0 ? '+' : '−'}
                      {trimNum(Math.abs(delta))} {r.unit} vs recipe
                    </div>
                  )}
                </div>
                <StepButton label={`Less ${name}`} onClick={() => nudge(i, -1)}>
                  <Minus className="h-4 w-4" />
                </StepButton>
                <button
                  type="button"
                  onClick={() => setSheet({ kind: 'amount', index: i })}
                  aria-label={`Change amount of ${name}, now ${amountLabel(r.qty, r.unit)}`}
                  className="h-10 min-w-[4.5rem] shrink-0 rounded-lg border border-border bg-background px-1.5 text-sm font-semibold tabular-nums hover:bg-muted/50"
                >
                  {amountLabel(r.qty, r.unit)}
                </button>
                <StepButton label={`More ${name}`} onClick={() => nudge(i, 1)}>
                  <Plus className="h-4 w-4" />
                </StepButton>
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-xs text-muted-foreground">
          + and − change one ingredient. Tap an amount to type what you have, or to
          scale the whole recipe from it.
        </p>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setSheet({ kind: 'more' })}>
            More
          </Button>
          <Button type="button" variant="primary" block disabled={saving} onClick={save}>
            {saving ? 'Saving…' : editingBatch ? 'Update batch' : 'Save as this week’s batch'}
          </Button>
        </div>
        {!editingBatch && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            The recipe itself is not changed.
          </p>
        )}
      </div>

      {sheet?.kind === 'portions' && (
        <PortionsSheet
          rows={rows}
          portions={portions}
          foods={foods}
          onChange={(nextRows, nextPortions) => {
            setRows(nextRows);
            setPortions(nextPortions);
          }}
          onClose={close}
        />
      )}
      {sheet?.kind === 'change' && (
        <ChangeSheet
          rows={rows}
          portions={portions}
          foods={foods}
          onApply={(qtys) => {
            setRows(rows.map((r, i) => ({ ...r, qty: qtys[i] })));
            close();
          }}
          onClose={close}
        />
      )}
      {sheet?.kind === 'amount' && (
        <AmountSheet
          rows={rows}
          index={sheet.index}
          portions={portions}
          foods={foods}
          name={nameOf(rows[sheet.index])}
          onApply={(nextRows, nextPortions) => {
            setRows(nextRows);
            setPortions(nextPortions);
            close();
          }}
          onClose={close}
        />
      )}
      {sheet?.kind === 'more' && (
        <MoreSheet
          rows={rows}
          portions={portions}
          foods={foods}
          per={per}
          rawGrams={totals.grams}
          totalG={totalG}
          onTotalG={setTotalG}
          onRows={setRows}
          editHref={editingBatch ? `/meals/${source.id}/edit` : null}
          onNavigate={navigate}
          onClose={close}
        />
      )}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  large,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  large?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center justify-center border border-border bg-muted/40 text-foreground hover:bg-muted disabled:opacity-40',
        large ? 'h-14 w-14 rounded-2xl' : 'h-10 w-10 rounded-lg',
      )}
    >
      {children}
    </button>
  );
}

/** One of two answers to "which do you mean?", shown side by side. */
function Choice({
  selected,
  title,
  detail,
  onClick,
}: {
  selected?: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-muted/30 hover:bg-muted/60',
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{detail}</span>
    </button>
  );
}

/** A big number with - and + either side, typeable. */
function BigStepper({
  value,
  suffix,
  label,
  onLess,
  onMore,
  onType,
  lessDisabled,
}: {
  value: number;
  suffix?: string;
  label: string;
  onLess: () => void;
  onMore: () => void;
  onType: (n: number) => void;
  lessDisabled?: boolean;
}) {
  const [text, setText] = useState(trimNum(value));
  useEffect(() => setText(trimNum(value)), [value]);
  return (
    <div className="flex items-center justify-center gap-3">
      <StepButton large label={`Less: ${label}`} disabled={lessDisabled} onClick={onLess}>
        <Minus className="h-5 w-5" />
      </StepButton>
      <div className="flex items-baseline gap-1.5">
        <Input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = num(e.target.value);
            if (n > 0) onType(n);
          }}
          onFocus={(e) => e.target.select()}
          onBlur={() => setText(trimNum(value))}
          className="h-14 w-28 px-1 text-center text-3xl font-semibold tabular-nums"
        />
        {suffix && <span className="w-10 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      <StepButton large label={`More: ${label}`} onClick={onMore}>
        <Plus className="h-5 w-5" />
      </StepButton>
    </div>
  );
}

interface SheetBase {
  rows: Row[];
  portions: number;
  foods: Map<string, Food> | undefined;
  onClose: () => void;
}

/**
 * Portions. The question "does the food change too?" is asked here, where
 * the number is being changed, with the outcome of each answer shown.
 * Changes apply as they are made; the amounts always scale from where the
 * sheet opened, so stepping up and back lands on the same numbers.
 */
function PortionsSheet({
  rows,
  portions,
  foods,
  onChange,
  onClose,
}: SheetBase & { onChange: (rows: Row[], portions: number) => void }) {
  const start = useRef({ rows, portions });
  const [mode, setMode] = useState<'scale' | 'split'>('scale');

  const apply = (nextPortions: number, nextMode: 'scale' | 'split') => {
    const from = start.current;
    if (nextMode === 'split') {
      onChange(from.rows, nextPortions);
      return;
    }
    const scaled = scaleForPortions(from.rows, from.portions, nextPortions);
    onChange(
      from.rows.map((r, i) => ({ ...r, qty: scaled[i] })),
      nextPortions,
    );
  };
  const setCount = (n: number) => apply(Math.max(0.5, n), mode);
  const pick = (next: 'scale' | 'split') => {
    setMode(next);
    apply(portions, next);
  };

  const startKcal = totalsOf(start.current.rows, foods).kcal / start.current.portions;
  const nowKcal = totalsOf(rows, foods).kcal / portions;
  const moved = portions !== start.current.portions;

  return (
    <Sheet open onClose={onClose} title="How many portions?" fullScreenMobile={false}>
      <div className="space-y-4 p-4">
        <BigStepper
          value={portions}
          label="Portions"
          lessDisabled={portions <= 1}
          onLess={() => setCount(Math.ceil(portions) - 1)}
          onMore={() => setCount(Math.floor(portions) + 1)}
          onType={setCount}
        />
        <div className="space-y-2">
          <Choice
            selected={mode === 'scale'}
            title="Cook more or less food"
            detail="Every ingredient scales. Each portion stays the same."
            onClick={() => pick('scale')}
          />
          <Choice
            selected={mode === 'split'}
            title="Same food, split differently"
            detail="Ingredients stay. Each portion gets bigger or smaller."
            onClick={() => pick('split')}
          />
        </div>
        <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm tabular-nums">
          {trimNum(portions)} {portions === 1 ? 'portion' : 'portions'} of{' '}
          <span className="font-semibold">{formatKcal(nowKcal)} kcal</span>
          {mode === 'split' && moved && ` (was ${formatKcal(startKcal)})`}
          {mode === 'scale' && moved && ', amounts scaled to match'}
          {!moved && ', as it is now'}.
        </p>
        <Button type="button" variant="primary" block onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

const KCAL_STEPS = [-200, -100, -50, 50, 100, 200];
const PROTEIN_STEPS = [-20, -10, -5, 5, 10, 20];

/**
 * Change what is in a portion: pick how much, then pick one of the sensible
 * ways to get there. Portions stay as they are. The list and the rules
 * that keep it sensible are `portionOptions` in batchMath.ts.
 */
function ChangeSheet({
  rows,
  portions,
  foods,
  onApply,
  onClose,
}: SheetBase & { onApply: (qtys: number[]) => void }) {
  const [by, setBy] = useState<'kcal' | 'protein'>('kcal');
  const [step, setStep] = useState<number | null>(null);
  const [target, setTarget] = useState('');
  const [showMinor, setShowMinor] = useState(false);

  const lines = rows.map((r) => {
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
  const t = totalsOf(rows, foods);
  const per = { kcal: t.kcal / portions, protein: t.protein / portions };
  const now = by === 'kcal' ? per.kcal : per.protein;
  // A typed target ("make it 600") is the same thing as a step from here.
  const typed = num(target) > 0 ? num(target) - now : null;
  const delta = typed ?? step;
  const worthIt = delta !== null && Math.abs(delta) >= (by === 'kcal' ? 5 : 1);
  const options = worthIt ? portionOptions(lines, portions, { [by]: delta }) : [];
  const shown = showMinor ? options : options.filter((o) => o.primary);
  const hidden = options.length - options.filter((o) => o.primary).length;

  return (
    <Sheet open onClose={onClose} title="Change a portion" fullScreenMobile={false}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground tabular-nums">
          Now {formatKcal(per.kcal)} kcal and {Math.round(per.protein)} g protein. Stays at{' '}
          {trimNum(portions)} {portions === 1 ? 'portion' : 'portions'}.
        </p>
        <SegmentedControl<'kcal' | 'protein'>
          value={by}
          onChange={(next) => {
            setBy(next);
            setStep(null);
            setTarget('');
            setShowMinor(false);
          }}
          aria-label="Change a portion by"
          options={[
            { value: 'kcal', label: 'Calories' },
            { value: 'protein', label: 'Protein' },
          ]}
        />
        <div className="grid grid-cols-6 gap-1.5">
          {(by === 'kcal' ? KCAL_STEPS : PROTEIN_STEPS).map((s) => {
            const on = step === s && typed === null;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setTarget('');
                  setShowMinor(false);
                  setStep(step === s ? null : s);
                }}
                className={cn(
                  'tap-target rounded-full border px-0 text-center text-sm font-medium tabular-nums transition-colors',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted/40 hover:bg-muted',
                )}
              >
                {s > 0 ? '+' : '−'}
                {Math.abs(s)}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          or make it
          <Input
            type="text"
            inputMode="decimal"
            aria-label={
              by === 'kcal' ? 'Calories per portion to reach' : 'Protein per portion to reach'
            }
            placeholder={String(Math.round(now))}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setStep(null);
              setShowMinor(false);
            }}
            className="h-9 w-20 px-2 text-right tabular-nums"
          />
          {by === 'kcal' ? 'kcal' : 'g protein'}
        </label>

        {!worthIt && (
          <p className="pt-1 text-sm text-muted-foreground">
            Pick how much. You then see the ways to get there.
          </p>
        )}
        {worthIt && options.length === 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            No single change gets there sensibly. Try a smaller step, or change the
            amounts by hand.
          </p>
        )}
        {shown.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {shown.map((o) => (
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
                onPick={() => onApply(o.qtys)}
              />
            ))}
          </ul>
        )}
        {hidden > 0 && !showMinor && (
          <button
            type="button"
            onClick={() => setShowMinor(true)}
            className="tap-target w-full rounded-lg px-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
          >
            Show {hidden} more {hidden === 1 ? 'option' : 'options'} (smaller ingredients)
          </button>
        )}
      </div>
    </Sheet>
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
 * One amount. Set what you actually have, then say what that means: only
 * this ingredient changed, or this is the measure the whole recipe should
 * scale to ("I have 900 g of chicken, not 800").
 */
function AmountSheet({
  rows,
  index,
  portions,
  foods,
  name,
  onApply,
  onClose,
}: SheetBase & {
  index: number;
  name: string;
  onApply: (rows: Row[], portions: number) => void;
}) {
  const row = rows[index];
  const [qty, setQty] = useState(row.qty);
  const step = nudgeStep(qty, row.unit);

  const justThis = rows.map((r, i) => (i === index ? { ...r, qty } : r));
  const f = scaleFactor(row.qty, qty);
  const scaled = rows.map((r, i) =>
    i === index ? { ...r, qty } : { ...r, qty: roundAmount(r.qty * f, r.unit) },
  );
  // More food at the same recipe is more portions, not bigger ones.
  const scaledPortions = Math.round(portions * f * 10) / 10;
  const kcalJustThis = totalsOf(justThis, foods).kcal / portions;
  const kcalNow = totalsOf(rows, foods).kcal / portions;
  const same = qty === row.qty;

  return (
    <Sheet open onClose={onClose} title={name} fullScreenMobile={false}>
      <div className="space-y-4 p-4">
        <p className="text-xs text-muted-foreground tabular-nums">
          The recipe has {amountLabel(row.base, row.unit)}. How much do you have?
        </p>
        <BigStepper
          value={qty}
          suffix={row.unit}
          label={`Amount of ${name}`}
          lessDisabled={qty <= step}
          onLess={() => setQty(Math.max(step, Math.round((qty - step) * 100) / 100))}
          onMore={() => setQty(Math.round((qty + step) * 100) / 100)}
          onType={setQty}
        />
        <div className="space-y-2">
          <Choice
            title="Change just this"
            detail={
              same
                ? 'Nothing else moves.'
                : `${trimNum(portions)} portions of ${formatKcal(kcalJustThis)} kcal. Nothing else moves.`
            }
            onClick={() => onApply(justThis, portions)}
          />
          {rows.length > 1 && (
            <Choice
              title="Scale the whole recipe to match"
              detail={
                same
                  ? 'Everything else follows.'
                  : `Makes ${trimNum(scaledPortions)} portions of ${formatKcal(kcalNow)} kcal. Everything else follows.`
              }
              onClick={() => onApply(scaled, scaledPortions)}
            />
          )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * The things needed occasionally: the solver for hitting protein and
 * calories at once, the cooked weight, and the way to the recipe editor.
 */
function MoreSheet({
  rows,
  portions,
  foods,
  per,
  rawGrams,
  totalG,
  onTotalG,
  onRows,
  editHref,
  onNavigate,
  onClose,
}: SheetBase & {
  per: { kcal: number; protein: number };
  rawGrams: number;
  totalG: string;
  onTotalG: (v: string) => void;
  onRows: (rows: Row[]) => void;
  editHref: string | null;
  onNavigate: (to: string) => void;
}) {
  const [targetProtein, setTargetProtein] = useState('');
  const [targetKcal, setTargetKcal] = useState('');
  const [fit, setFit] = useState<FitResult | null>(null);

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
    onRows(rows.map((r, i) => ({ ...r, qty: result.qtys[i] })));
    setFit(result);
  };
  const toggleLock = (index: number) =>
    onRows(rows.map((r, i) => (i === index ? { ...r, locked: !r.locked } : r)));

  return (
    <Sheet open onClose={onClose} title="More">
      <div className="space-y-5 p-4">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Exact targets</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hit protein and calories per portion at the same time. Locked
              ingredients stay as they are, the rest are adjusted.
            </p>
          </div>
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
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rows.map((r, i) => {
              const name = foods?.get(r.food_id)?.name ?? '(deleted food)';
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => toggleLock(i)}
                    aria-pressed={r.locked}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    {r.locked ? (
                      <Lock className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <LockOpen className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {amountLabel(r.qty, r.unit)} · {r.locked ? 'stays' : 'can change'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="secondary" block disabled={!canFit} onClick={runFit}>
            Fit amounts
          </Button>
          {fit && <FitNote fit={fit} />}
        </section>

        <LabeledInput
          label="Cooked weight (optional)"
          type="text"
          inputMode="decimal"
          placeholder={String(Math.round(rawGrams))}
          value={totalG}
          onChange={(e) => onTotalG(e.target.value)}
          trailing="g"
          hint="Weigh the finished dish to log it by grams. Left empty, the raw ingredient weight is used."
        />

        {editHref && (
          <button
            type="button"
            onClick={() => onNavigate(editHref)}
            className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Edit this batch</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Add or remove ingredients, rename, delete.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        <Button type="button" variant="primary" block onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
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
