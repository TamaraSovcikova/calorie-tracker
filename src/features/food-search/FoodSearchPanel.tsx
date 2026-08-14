import { useMemo, useState } from 'react';
import {
  ChefHat,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Settings as SettingsIcon,
  Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CoachTip } from '@/components/ui/CoachTip';
import { useFoodSearch } from './useFoodSearch';
import { FoodResultRow } from './FoodResultRow';
import { toggleFavorite } from '@/db/repos/foods';
import { useMealsWithTotals } from '@/features/meals/useMealsWithTotals';
import { matchesMealQuery } from '@/features/meals/mealMath';
import { formatKcal } from '@/lib/macros';
import type { Food, Meal, MealSection } from '@/db/types';

interface FoodSearchPanelProps {
  section: MealSection;
  onPick: (food: Food) => void;
  onManualEntry: (presetName: string) => void;
  /** When provided, saved meals matching the query are offered alongside
   *  foods. Omitted where logging a whole meal makes no sense, e.g. while
   *  picking an ingredient for a meal you are building. */
  onPickMeal?: (meal: Meal) => void;
}

const SECTION_TITLES: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <div className="flex items-baseline justify-between px-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}

/** A saved-meal hit in the food search, weighted like a FoodResultRow. */
function MealResultRow({
  meal,
  kcal,
  itemCount,
  onClick,
}: {
  meal: Meal;
  kcal: number;
  itemCount: number;
  onClick: (meal: Meal) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(meal)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted/60 active:bg-muted"
    >
      {meal.image_url ? (
        <img
          src={meal.image_url}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-lg bg-muted object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ChefHat className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {meal.favorite && (
            <Star
              className="h-3 w-3 shrink-0 text-amber-500"
              fill="currentColor"
            />
          )}
          <span className="truncate text-sm font-medium">{meal.name}</span>
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
            Meal
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatKcal(kcal)} kcal per portion · {itemCount}{' '}
          {itemCount === 1 ? 'ingredient' : 'ingredients'}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

type Category = 'all' | 'favourites' | 'frequent' | 'recent';

export function FoodSearchPanel({
  section,
  onPick,
  onManualEntry,
  onPickMeal,
}: FoodSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const {
    favorites,
    frequent,
    recents,
    recentMatches,
    myProducts,
    library,
    common,
    packaged,
    isSearching,
    rateLimitedSeconds,
    errorBanner,
    needsUsdaKey,
    showPackaged,
  } = useFoodSearch(query);

  const hasQuery = query.trim().length > 0;
  const allMeals = useMealsWithTotals();

  // Saved meals matching the query. Strict first, typo-forgiving only if
  // that found nothing - the same rule the food search follows.
  const mealMatches = useMemo(() => {
    if (!onPickMeal || !allMeals || !hasQuery) return [];
    const strict = allMeals.filter((m) => matchesMealQuery(m.haystack, query));
    if (strict.length > 0) return strict.slice(0, 6);
    return allMeals
      .filter((m) => matchesMealQuery(m.haystack, query, { fuzzy: true }))
      .slice(0, 6);
  }, [allMeals, query, hasQuery, onPickMeal]);

  const handleFav = (food: Food) => void toggleFavorite(food.id);
  // Reset category filter when user starts typing
  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (v.trim().length > 0) setCategory('all');
  };
  const emptyStateEmpty =
    favorites.length === 0 && frequent.length === 0 && recents.length === 0;
  const noResults =
    hasQuery &&
    !isSearching &&
    mealMatches.length === 0 &&
    myProducts.length === 0 &&
    recentMatches.length === 0 &&
    library.length === 0 &&
    common.length === 0 &&
    packaged.length === 0;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={onPickMeal ? 'Search foods and meals…' : 'Search foods…'}
            className="pl-9"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Adding to{' '}
          <span className="font-medium text-foreground">
            {SECTION_TITLES[section]}
          </span>
        </p>
        {!hasQuery && (favorites.length > 0 || frequent.length > 0 || recents.length > 0) && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {(
              [
                { key: 'all', label: 'All' },
                ...(favorites.length > 0 ? [{ key: 'favourites', label: `Favourites (${favorites.length})` }] : []),
                ...(frequent.length > 0 ? [{ key: 'frequent', label: `Frequent` }] : []),
                ...(recents.length > 0 ? [{ key: 'recent', label: `Recent (${recents.length})` }] : []),
              ] as { key: Category; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: 20,
                  border: category === key ? 'none' : '1px solid var(--color-border)',
                  background: category === key ? 'var(--color-accent-deep)' : 'transparent',
                  color: category === key ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {needsUsdaKey && hasQuery && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <SettingsIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1">
            Add a free USDA API key in Settings for cleaner generic-food results.
          </span>
          <Link
            to="/settings"
            className="shrink-0 font-medium text-primary hover:underline"
          >
            Settings
          </Link>
        </div>
      )}

      {(rateLimitedSeconds || errorBanner) && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {rateLimitedSeconds != null
            ? `Search rate limit hit. Showing local + cached results - try again in ${rateLimitedSeconds}s.`
            : errorBanner}
        </div>
      )}

      <div className="flex-1 space-y-4 px-2 py-3">
        {!hasQuery && (
          <CoachTip id="add-food-tabs">
            Use the tabs above: <span className="font-medium text-foreground">Scan</span>{' '}
            a barcode, log a saved <span className="font-medium text-foreground">Meal</span>{' '}
            in one tap, or <span className="font-medium text-foreground">Quick</span>-add
            bare calories.
          </CoachTip>
        )}
        {!hasQuery && (
          <>
            {(category === 'all' || category === 'favourites') && favorites.length > 0 && (
              <Group title="Favourites" hint={`${favorites.length}`}>
                {favorites.map((f) => (
                  <FoodResultRow key={f.id} food={f} onClick={onPick} onToggleFavorite={handleFav} />
                ))}
              </Group>
            )}
            {(category === 'all' || category === 'frequent') && frequent.length > 0 && (
              <Group title="Frequently logged">
                {frequent.map((f) => (
                  <FoodResultRow key={f.id} food={f} onClick={onPick} onToggleFavorite={handleFav} />
                ))}
              </Group>
            )}
            {(category === 'all' || category === 'recent') && recents.length > 0 && (
              <Group title="Recent" hint={`${recents.length}`}>
                {recents.map((f) => (
                  <FoodResultRow key={f.id} food={f} onClick={onPick} onToggleFavorite={handleFav} />
                ))}
              </Group>
            )}
            {emptyStateEmpty && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Search by name, scan a barcode, or pick a saved meal.
              </div>
            )}
          </>
        )}

        {hasQuery && (
          <>
            {onPickMeal && mealMatches.length > 0 && (
              <Group
                title="Your meals"
                hint={mealMatches.length > 1 ? `${mealMatches.length}` : undefined}
              >
                {mealMatches.map((m) => (
                  <MealResultRow
                    key={m.meal.id}
                    meal={m.meal}
                    kcal={m.totals.kcal}
                    itemCount={m.itemCount}
                    onClick={onPickMeal}
                  />
                ))}
              </Group>
            )}

            {myProducts.length > 0 && (
              <Group title="My Products">
                {myProducts.map((f) => (
                  <FoodResultRow
                    key={f.id}
                    food={f}
                    onClick={onPick}
                    onToggleFavorite={handleFav}
                  />
                ))}
              </Group>
            )}

            {recentMatches.length > 0 && (
              <Group title="Recently used">
                {recentMatches.map((f) => (
                  <FoodResultRow
                    key={f.id}
                    food={f}
                    onClick={onPick}
                    onToggleFavorite={handleFav}
                  />
                ))}
              </Group>
            )}

            {library.length > 0 && (
              <Group title="Saved & scanned">
                {library.map((f) => (
                  <FoodResultRow
                    key={f.id}
                    food={f}
                    onClick={onPick}
                    onToggleFavorite={handleFav}
                  />
                ))}
              </Group>
            )}

            {common.length > 0 && (
              <Group title="Common foods" hint="USDA">
                {common.map((f) => (
                  <FoodResultRow
                    key={f.id}
                    food={f}
                    onClick={onPick}
                    onToggleFavorite={handleFav}
                  />
                ))}
              </Group>
            )}

            {showPackaged && packaged.length > 0 && (
              <Group title="Packaged products">
                {packaged.map((f) => (
                  <FoodResultRow
                    key={f.id}
                    food={f}
                    onClick={onPick}
                    onToggleFavorite={handleFav}
                  />
                ))}
              </Group>
            )}

            {!showPackaged && (
              <p className="px-2 text-[11px] text-muted-foreground">
                New packaged products from the web are hidden (your saved &
                scanned ones still show) - toggle in Settings → Food sources.
              </p>
            )}

            {noResults && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No matches. Add it manually below.
              </div>
            )}

            <div className="px-2">
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() => onManualEntry(query.trim())}
              >
                <Plus className="h-4 w-4" />
                Add "{query.trim() || 'new product'}" manually
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
