import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Scale, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { db } from '@/db/dexie';
import { setFoodPrice, useFoodPrices } from '@/db/repos/foodPrices';
import { IngredientPickerSheet } from '@/features/meals/IngredientPickerSheet';
import { formatKcal } from '@/lib/macros';
import { cn } from '@/lib/cn';
import type { Food } from '@/db/types';
import {
  bestIndex,
  compareProduct,
  type Basis,
  type ComparedProduct,
} from './compareMath';

const MAX_PRODUCTS = 4;
const STORE_KEY = 'calorie-tracker:compare.v1';

type BasisKind = Basis['kind'];

interface Saved {
  ids: string[];
  basis: BasisKind;
  protein: string;
  kcal: string;
}

const DEFAULTS: Saved = { ids: [], basis: 'per100', protein: '30', kcal: '300' };

/** The tray survives leaving the screen: a shop visit is many small looks. */
function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      ids: Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === 'string') : [],
      basis: (['per100', 'pack', 'protein', 'kcal'] as const).includes(
        v.basis as BasisKind,
      )
        ? (v.basis as BasisKind)
        : 'per100',
      protein: typeof v.protein === 'string' ? v.protein : DEFAULTS.protein,
      kcal: typeof v.kcal === 'string' ? v.kcal : DEFAULTS.kcal,
    };
  } catch {
    return DEFAULTS;
  }
}

const num = (text: string) => parseFloat(text.replace(',', '.'));
const grams = (n: number | null) => (n === null ? '-' : `${Math.round(n)} g`);
const kcal = (n: number | null) => (n === null ? '-' : formatKcal(n));
const money = (n: number | null) => (n === null ? '-' : n.toFixed(2));

/**
 * Compare up to four products on the same footing: per 100 g, per pack, or
 * "how much of each to reach a protein or calorie target", with cost.
 * The maths and the reasoning for the four footings are in compareMath.ts.
 */
export function CompareTab() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [picking, setPicking] = useState(false);
  const prices = useFoodPrices();

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      // Private mode: the tray lasts for this visit only.
    }
  }, [saved]);

  const foods = useLiveQuery(async () => {
    const rows = await db.foods.bulkGet(saved.ids);
    return rows.filter((f): f is Food => !!f && !f.deleted_at);
  }, [saved.ids]);

  const basis: Basis = useMemo(() => {
    if (saved.basis === 'protein') return { kind: 'protein', target: num(saved.protein) };
    if (saved.basis === 'kcal') return { kind: 'kcal', target: num(saved.kcal) };
    return { kind: saved.basis };
  }, [saved.basis, saved.protein, saved.kcal]);

  const results: ComparedProduct[] = useMemo(
    () =>
      (foods ?? []).map((f) => compareProduct(f, basis, prices?.get(f.id) ?? {})),
    [foods, basis, prices],
  );

  const add = (food: Food) =>
    setSaved((s) =>
      s.ids.includes(food.id) || s.ids.length >= MAX_PRODUCTS
        ? s
        : { ...s, ids: [...s.ids, food.id] },
    );
  const remove = (id: string) =>
    setSaved((s) => ({ ...s, ids: s.ids.filter((x) => x !== id) }));

  const list = foods ?? [];
  const full = list.length >= MAX_PRODUCTS;
  const missingPack =
    saved.basis === 'pack' && results.some((r) => r.grams === null);
  const anyPrice = results.some((r) => r.costPer100 !== null);

  return (
    <div className="mx-auto max-w-md animate-fade-in space-y-4 px-4">
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Scale className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="mt-3 text-base font-medium">Compare products</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan or search two to four products and see them side by side: per
            100 g, per pack, or how much of each you would need for a protein or
            calorie target, and what that costs.
          </p>
          <Button className="mt-4" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" />
            Add a product
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <SegmentedControl<BasisKind>
              value={saved.basis}
              onChange={(next) => setSaved((s) => ({ ...s, basis: next }))}
              aria-label="Compare by"
              options={[
                { value: 'per100', label: '100 g' },
                { value: 'pack', label: 'Pack' },
                { value: 'protein', label: 'Protein' },
                { value: 'kcal', label: 'Calories' },
              ]}
            />
            {(saved.basis === 'protein' || saved.basis === 'kcal') && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                How much of each to get
                <Input
                  type="text"
                  inputMode="decimal"
                  aria-label={saved.basis === 'protein' ? 'Protein target' : 'Calorie target'}
                  value={saved.basis === 'protein' ? saved.protein : saved.kcal}
                  onChange={(e) =>
                    setSaved((s) =>
                      s.basis === 'protein'
                        ? { ...s, protein: e.target.value }
                        : { ...s, kcal: e.target.value },
                    )
                  }
                  className="h-9 w-20 px-2 text-right tabular-nums"
                />
                {saved.basis === 'protein' ? 'g protein' : 'kcal'}
              </label>
            )}
            {missingPack && (
              <p className="text-xs text-muted-foreground">
                Add a pack size below to compare whole packs.
              </p>
            )}
          </div>

          <CompareTable
            foods={list}
            results={results}
            basis={saved.basis}
            showCost={anyPrice}
            onRemove={remove}
          />

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Price and pack size</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Optional. Stays on this phone and is remembered per product.
            </p>
            <ul className="mt-3 space-y-3">
              {list.map((f) => (
                <PriceRow
                  key={f.id}
                  food={f}
                  price={prices?.get(f.id)?.price}
                  packG={prices?.get(f.id)?.pack_g}
                />
              ))}
            </ul>
          </section>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              block
              disabled={full}
              onClick={() => setPicking(true)}
            >
              <Plus className="h-4 w-4" />
              {full ? `${MAX_PRODUCTS} products is the limit` : 'Add a product'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSaved((s) => ({ ...s, ids: [] }))}
            >
              Clear
            </Button>
          </div>
        </>
      )}

      <IngredientPickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        onFood={add}
        title="Add a product to compare"
      />
    </div>
  );
}

interface RowDef {
  label: string;
  values: (number | null)[];
  format: (n: number | null) => string;
  /** Which end is better, when there is one. */
  best?: 'lowest' | 'highest';
}

function CompareTable({
  foods,
  results,
  basis,
  showCost,
  onRemove,
}: {
  foods: Food[];
  results: ComparedProduct[];
  basis: BasisKind;
  showCost: boolean;
  onRemove: (id: string) => void;
}) {
  const col = (pick: (r: ComparedProduct) => number | null) => results.map(pick);
  const g1 = (n: number | null) => (n === null ? '-' : `${Math.round(n * 10) / 10} g`);

  // What "better" means depends on the footing. For a protein target every
  // product gives the same protein, so the question is what else comes with
  // it: fewer calories and less to eat. For a calorie target it is the
  // reverse: more protein for the same calories.
  const rows: RowDef[] = [
    {
      label: basis === 'per100' ? 'Amount' : basis === 'pack' ? 'Pack' : 'You need',
      values: col((r) => r.grams),
      format: grams,
      best: basis === 'protein' ? 'lowest' : undefined,
    },
    {
      label: 'Calories',
      values: col((r) => r.kcal),
      format: kcal,
      best: basis === 'protein' ? 'lowest' : undefined,
    },
    {
      label: 'Protein',
      values: col((r) => r.protein),
      format: g1,
      best: basis === 'protein' ? undefined : 'highest',
    },
    { label: 'Carbs', values: col((r) => r.carbs), format: g1 },
    { label: 'Fat', values: col((r) => r.fat), format: g1 },
  ];
  const costRows: RowDef[] = [
    ...(basis === 'per100'
      ? []
      : [
          {
            label: 'Cost',
            values: col((r) => r.cost),
            format: money,
            best: 'lowest' as const,
          },
        ]),
    {
      label: 'Per 100 g',
      values: col((r) => r.costPer100),
      format: money,
      best: 'lowest',
    },
    {
      label: 'Per 10 g protein',
      values: col((r) => r.costPer10gProtein),
      format: money,
      best: 'lowest',
    },
  ];

  const template = `84px repeat(${foods.length}, minmax(86px, 1fr))`;
  const renderRow = (row: RowDef) => {
    const best = row.best ? bestIndex(row.values, row.best) : -1;
    return (
      <div
        key={row.label}
        role="row"
        className="grid items-center border-t border-border"
        style={{ gridTemplateColumns: template }}
      >
        <div role="rowheader" className="py-2 pl-3 pr-1 text-xs text-muted-foreground">
          {row.label}
        </div>
        {row.values.map((v, i) => (
          <div
            key={foods[i].id}
            role="cell"
            className={cn(
              'px-2 py-2 text-right text-sm tabular-nums',
              i === best && 'font-semibold text-primary',
              v === null && 'text-muted-foreground/50',
            )}
          >
            {row.format(v)}
            {i === best && <span className="sr-only"> (best)</span>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div role="table" aria-label="Product comparison" style={{ minWidth: 84 + foods.length * 86 }}>
        <div role="row" className="grid" style={{ gridTemplateColumns: template }}>
          <div role="columnheader" />
          {foods.map((f) => (
            <div key={f.id} role="columnheader" className="relative px-2 pb-2 pt-3 text-right">
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                aria-label={`Remove ${f.name}`}
                className="absolute right-0 top-0 rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="mt-3 line-clamp-2 break-words text-xs font-semibold leading-tight">
                {f.name}
              </div>
              {f.brand && (
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {f.brand}
                </div>
              )}
            </div>
          ))}
        </div>
        {rows.map(renderRow)}
        {showCost && (
          <>
            <div className="border-t border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Price
            </div>
            {costRows.map(renderRow)}
          </>
        )}
      </div>
    </div>
  );
}

/** Price and pack size for one product. Saved as it is typed. */
function PriceRow({
  food,
  price,
  packG,
}: {
  food: Food;
  price: number | undefined;
  packG: number | undefined;
}) {
  const [priceText, setPriceText] = useState(price ? String(price) : '');
  const [packText, setPackText] = useState(packG ? String(packG) : '');

  const save = (nextPrice: string, nextPack: string) => {
    const p = num(nextPrice);
    const g = num(nextPack);
    void setFoodPrice(food.id, {
      price: p > 0 ? p : undefined,
      pack_g: g > 0 ? g : undefined,
    });
  };

  return (
    <li>
      <div className="truncate text-sm font-medium">{food.name}</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <label className="relative block">
          <span className="sr-only">Price of {food.name}</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Price"
            value={priceText}
            onChange={(e) => {
              setPriceText(e.target.value);
              save(e.target.value, packText);
            }}
            className="h-10 tabular-nums"
          />
        </label>
        <label className="relative block">
          <span className="sr-only">Pack size of {food.name} in grams</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Pack size"
            value={packText}
            onChange={(e) => {
              setPackText(e.target.value);
              save(priceText, e.target.value);
            }}
            className="h-10 pr-8 tabular-nums"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            g
          </span>
        </label>
      </div>
    </li>
  );
}
