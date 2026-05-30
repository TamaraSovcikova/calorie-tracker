import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat,
  Pencil,
  Plus,
  ScanLine,
  Search,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';
import { LogMealSheet } from './LogMealSheet';
import { RecipeScanSheet } from '@/features/recipe-scan/RecipeScanSheet';
import { CategoriseSheet } from './CategoriseSheet';
import { useMealsWithTotals } from './useMealsWithTotals';
import { formatServings, matchesMealQuery } from './mealMath';
import {
  categoryLabel,
  mealCategories,
  MEAL_CATEGORIES,
  parseCustomCategories,
} from './mealCategory';
import { toggleMealFavorite } from '@/db/repos/meals';
import { useMealLogStats } from '@/db/repos/diary';
import { useProfile } from '@/db/repos/profile';
import { formatKcal } from '@/lib/macros';
import type { Meal } from '@/db/types';

/** 'all' | 'favorites' | a category token. */
type MealFilter = string;
type MealSort = 'recent' | 'name' | 'calories' | 'logged';

/** Meals sub-tab of the Library: saved meal templates, tap to log. */
export function MealsLibrary() {
  const navigate = useNavigate();
  const meals = useMealsWithTotals();
  const logStats = useMealLogStats();
  const profile = useProfile();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MealFilter>('all');
  const [sort, setSort] = useState<MealSort>('recent');
  const [logging, setLogging] = useState<Meal | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriseOpen, setCategoriseOpen] = useState(false);

  const uncategorised = useMemo(
    () => (meals ?? []).filter((m) => mealCategories(m.meal).length === 0),
    [meals],
  );

  const visible = useMemo(() => {
    if (!meals) return [];
    let list = meals.filter((m) => matchesMealQuery(m.haystack, query));
    if (filter === 'favorites') list = list.filter((m) => m.meal.favorite);
    else if (filter !== 'all')
      list = list.filter((m) => mealCategories(m.meal).includes(filter));
    // Favourites stay pinned on top, then the chosen sort key.
    return [...list].sort((a, b) => {
      const fa = a.meal.favorite ? 1 : 0;
      const fb = b.meal.favorite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      switch (sort) {
        case 'name':
          return a.meal.name.localeCompare(b.meal.name);
        case 'calories':
          return b.totals.kcal - a.totals.kcal;
        case 'logged':
          return (
            (logStats?.get(b.meal.id)?.count ?? 0) -
            (logStats?.get(a.meal.id)?.count ?? 0)
          );
        default:
          return a.meal.updated_at < b.meal.updated_at ? 1 : -1;
      }
    });
  }, [meals, query, filter, sort, logStats]);

  // Chips: built-ins, then any custom categories (from profile, plus any
  // still referenced by a meal even if removed from the profile list).
  const customTokens = useMemo(() => {
    const tokens = new Set(parseCustomCategories(profile?.custom_meal_categories));
    for (const m of meals ?? []) {
      for (const t of mealCategories(m.meal)) {
        if (!(MEAL_CATEGORIES as readonly string[]).includes(t)) tokens.add(t);
      }
    }
    return [...tokens];
  }, [profile?.custom_meal_categories, meals]);

  const filterChips: { value: MealFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'favorites', label: '★ Favourites' },
    ...MEAL_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
    ...customTokens.map((t) => ({ value: t, label: categoryLabel(t) })),
  ];

  return (
    <>
      <Button block variant="primary" onClick={() => setMenuOpen(true)}>
        <Plus className="h-4 w-4" />
        New meal
      </Button>

      {meals && meals.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, note, or ingredient…"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
            {filterChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilter(chip.value)}
                aria-pressed={filter === chip.value}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === chip.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {visible.length} {visible.length === 1 ? 'meal' : 'meals'}
            </span>
            <Select
              aria-label="Sort meals"
              value={sort}
              onChange={(e) => setSort(e.target.value as MealSort)}
              className="h-9 w-auto text-sm"
            >
              <option value="recent">Recent</option>
              <option value="name">Name A-Z</option>
              <option value="calories">Calories</option>
              <option value="logged">Most logged</option>
            </Select>
          </div>

          {uncategorised.length > 0 && (
            <button
              type="button"
              onClick={() => setCategoriseOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs text-primary hover:bg-primary/10"
            >
              <Wand2 className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                Auto-categorise {uncategorised.length} uncategorised{' '}
                {uncategorised.length === 1 ? 'meal' : 'meals'}
              </span>
            </button>
          )}
        </>
      )}

      {!meals ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : meals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <ChefHat
            className="mx-auto h-10 w-10 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="mt-3 text-base font-medium">No saved meals yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a meal once, log it any day with one tap.
          </p>
          <Button className="mt-4" onClick={() => navigate('/meals/new')}>
            <Plus className="h-4 w-4" />
            Create your first meal
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {query.trim()
            ? `No meals match "${query}".`
            : 'No meals in this filter.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ meal, totals, itemCount, servings }) => (
            <li
              key={meal.id}
              className="flex items-center gap-1 rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setLogging(meal)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl px-4 py-3 text-left hover:bg-muted/40 active:scale-[0.99] transition-transform"
              >
                {meal.image_url ? (
                  <img
                    src={meal.image_url}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-lg bg-muted object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ChefHat className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{meal.name}</span>
                    {mealCategories(meal).map((token) => (
                      <span
                        key={token}
                        className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {categoryLabel(token)}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    <span className="mx-1.5">·</span>
                    <span className="font-medium text-foreground">
                      {formatKcal(totals.kcal)}
                    </span>{' '}
                    kcal{servings > 1 ? '/portion' : ''}
                    {servings > 1 && (
                      <>
                        <span className="mx-1.5">·</span>
                        makes {formatServings(servings)}
                      </>
                    )}
                  </div>
                  {meal.notes && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {meal.notes}
                    </div>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => void toggleMealFavorite(meal.id)}
                aria-label={
                  meal.favorite
                    ? `Unstar ${meal.name}`
                    : `Star ${meal.name}`
                }
                aria-pressed={!!meal.favorite}
                className={cn(
                  'tap-target rounded-lg p-2.5 hover:bg-muted',
                  meal.favorite
                    ? 'text-amber-500'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Star
                  className="h-4 w-4"
                  fill={meal.favorite ? 'currentColor' : 'none'}
                />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/meals/${meal.id}/edit`)}
                aria-label={`Edit ${meal.name}`}
                className="tap-target mr-1 rounded-lg p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LogMealSheet
        open={logging !== null}
        meal={logging}
        onClose={() => setLogging(null)}
      />
      <RecipeScanSheet open={scanOpen} onClose={() => setScanOpen(false)} />

      <CategoriseSheet
        open={categoriseOpen}
        meals={uncategorised}
        logStats={logStats}
        onClose={() => setCategoriseOpen(false)}
      />

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="New meal"
        fullScreenMobile={false}
      >
        <div className="space-y-2 p-4">
          <NewMealOption
            icon={<Plus className="h-4 w-4 text-primary" />}
            title="Blank meal"
            subtitle="Build it from scratch, ingredient by ingredient"
            onClick={() => {
              setMenuOpen(false);
              navigate('/meals/new');
            }}
          />
          <NewMealOption
            icon={<ScanLine className="h-4 w-4 text-primary" />}
            title="Scan a recipe"
            subtitle="Turn a recipe screenshot into a ready-to-edit meal"
            onClick={() => {
              setMenuOpen(false);
              setScanOpen(true);
            }}
          />
          <NewMealOption
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="Plan with AI"
            subtitle="Turn your ingredients + targets into meal-prep recipes"
            onClick={() => {
              setMenuOpen(false);
              navigate('/meals/plan');
            }}
          />
        </div>
      </Sheet>
    </>
  );
}

function NewMealOption({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </button>
  );
}
