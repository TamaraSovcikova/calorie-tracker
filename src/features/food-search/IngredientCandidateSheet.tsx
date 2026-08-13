import { useEffect, useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Input, LabeledInput } from '@/components/ui/Input';
import { useFoodSearch } from './useFoodSearch';
import { computeMacros } from './foodMath';
import type { Food } from '@/db/types';
import {
  TIER_LABEL,
  type IngredientCandidate,
} from './ingredientMatch';
import { formatKcal } from '@/lib/macros';

interface IngredientCandidateSheetProps {
  /** Ingredient name as read off the recipe or photo. */
  name: string;
  grams: number;
  candidates: IngredientCandidate[];
  /** Index into `candidates`, or -1 for "no match". */
  chosen: number;
  onPick: (chosen: number) => void;
  /**
   * Picked a food that was NOT among the suggestions. The escape hatch that
   * makes the whole thing work: a Belgian product called "Américain naturel"
   * shares no words with "beef mince", so the matcher can never suggest it
   * and no dictionary will ever contain it. Being able to find it once is
   * what teaches the alias.
   */
  onPickFood?: (food: Food) => void;
  /** When set, the amount is editable here too. */
  onGramsChange?: (grams: number) => void;
  /** Offer "none of these - add blank". Off for the photo log, where a
   *  blank food would silently log zero calories into the diary. */
  allowBlank?: boolean;
  onClose: () => void;
}

/**
 * The choice the matcher was making, shown rather than made silently.
 *
 * Shared by the recipe review and the photo log. Both used to commit to
 * whatever won the match, which is how a 464 kcal/100g mystery food reached
 * a stuffed pepper recipe looking exactly like a real ingredient.
 *
 * Editing the amount lives here too: seeing that "4 large peppers" resolved
 * to 400g is only half useful if the only place to fix it is a later screen.
 */
export function IngredientCandidateSheet({
  name,
  grams,
  candidates,
  chosen,
  onPick,
  onPickFood,
  onGramsChange,
  allowBlank = true,
  onClose,
}: IngredientCandidateSheetProps) {
  const [gramsText, setGramsText] = useState(String(grams));
  useEffect(() => setGramsText(String(grams)), [grams]);

  const commitGrams = () => {
    const n = parseFloat(gramsText);
    if (!Number.isFinite(n) || n <= 0) {
      setGramsText(String(grams)); // revert rather than store nonsense
      return;
    }
    onGramsChange?.(n);
  };

  // Preview against the edited amount, so changing it updates the kcal the
  // user is choosing between.
  const previewGrams = (() => {
    const n = parseFloat(gramsText);
    return Number.isFinite(n) && n > 0 ? n : grams;
  })();

  return (
    <Sheet open onClose={onClose} title={name} fullScreenMobile={false}>
      <div className="space-y-3 p-4">
        {onGramsChange && (
          <LabeledInput
            label="Amount"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={gramsText}
            onChange={(e) => setGramsText(e.target.value)}
            onBlur={commitGrams}
            trailing="g"
          />
        )}
        <p className="text-xs text-muted-foreground">
          {candidates.length > 0
            ? 'Which food is this? Calories shown for the amount above.'
            : 'Nothing in your library matches this. It will be added as a blank food you can fill in.'}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {candidates.map((cand, i) => {
          const kcal = computeMacros(cand.food, {
            mode: 'g',
            qty: previewGrams,
          }).kcal;
          const active = i === chosen;
          return (
            <li key={cand.food.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {cand.food.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                    {formatKcal(kcal)} kcal · {Math.round(cand.food.kcal_100)}{' '}
                    kcal/100g · {TIER_LABEL[cand.tier]}
                  </span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
        {onPickFood && (
          <li className="bg-muted/30 px-4 py-3">
            <SearchForFood
              grams={previewGrams}
              onPick={onPickFood}
              autoFocus={candidates.length === 0}
            />
          </li>
        )}
        {allowBlank && (
          <li>
            <button
              type="button"
              onClick={() => onPick(-1)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
            >
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  None of these - add blank
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Creates "{name}" with no macros for you to fill in.
                </span>
              </span>
              {chosen === -1 && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          </li>
        )}
      </ul>
    </Sheet>
  );
}

/** How many search results to show before it stops being a shortlist. */
const SEARCH_LIMIT = 12;

/**
 * Search the user's own foods (and the wider sources) for something the
 * matcher could not suggest.
 *
 * With an empty box this shows what they log most and most recently, which is
 * usually where the answer is - "the mince I always buy" is by definition a
 * frequent food, however it happens to be named.
 */
function SearchForFood({
  grams,
  onPick,
  autoFocus,
}: {
  grams: number;
  onPick: (food: Food) => void;
  autoFocus: boolean;
}) {
  const [query, setQuery] = useState('');
  const search = useFoodSearch(query);

  const results = useMemo(() => {
    const groups = query.trim()
      ? [search.recentMatches, search.myProducts, search.library, search.common, search.packaged]
      : [search.favorites, search.frequent, search.recents];
    const seen = new Set<string>();
    const out: Food[] = [];
    for (const g of groups) {
      for (const f of g) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        out.push(f);
        if (out.length >= SEARCH_LIMIT) return out;
      }
    }
    return out;
  }, [query, search]);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Not listed? Search your foods…"
        autoFocus={autoFocus}
        aria-label="Search for a food"
      />
      {results.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {search.isSearching
            ? 'Searching…'
            : query.trim()
              ? 'Nothing found. Scan its barcode from the diary first, then it will be here.'
              : 'Start typing, or log the food once and it will show up here.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onPick(f)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {f.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                    {f.brand ? `${f.brand} · ` : ''}
                    {formatKcal(computeMacros(f, { mode: 'g', qty: grams }).kcal)} kcal
                    {' · '}
                    {Math.round(f.kcal_100)} kcal/100g
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">
        Whatever you pick is remembered for this ingredient next time.
      </p>
    </div>
  );
}
