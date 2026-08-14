import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat,
  ChevronDown,
  Coffee,
  Cookie,
  Moon,
  Pencil,
  Plus,
  ScanLine,
  Search,
  Sparkles,
  Star,
  Sun,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';
import { LogMealSheet } from './LogMealSheet';
import { StarredMealsShelf } from './StarredMealsShelf';
import { RecipeScanSheet } from '@/features/recipe-scan/RecipeScanSheet';
import { CategoriseSheet } from './CategoriseSheet';
import { useMealsWithTotals } from './useMealsWithTotals';
import { filterMealsByQuery, formatServings } from './mealMath';
import {
  buildMealFilterChips,
  categoryLabel,
  mealCategories,
  mealMatchesFilter,
} from './mealCategory';
import { toggleMealFavorite } from '@/db/repos/meals';
import { useMealLogStats } from '@/db/repos/diary';
import { useProfile } from '@/db/repos/profile';
import { formatKcal } from '@/lib/macros';
import type { Meal } from '@/db/types';
import { type LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

type LucideIcon = ForwardRefExoticComponent<LucideProps & RefAttributes<SVGSVGElement>>;

const CAT_ICON: Record<string, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

function mealPrimaryCategory(meal: Meal): string {
  return mealCategories(meal)[0] ?? '';
}

type MealSort = 'recent' | 'name' | 'calories' | 'logged';

interface MealsLibraryProps {
  filter: string;
  setFilter: (v: string) => void;
}

export function MealsLibrary({ filter, setFilter }: MealsLibraryProps) {
  const navigate = useNavigate();
  const meals = useMealsWithTotals();
  const logStats = useMealLogStats();
  const profile = useProfile();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MealSort>('recent');
  const [logging, setLogging] = useState<Meal | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [categoriseOpen, setCategoriseOpen] = useState(false);

  const uncategorised = useMemo(
    () => (meals ?? []).filter((m) => mealCategories(m.meal).length === 0),
    [meals],
  );

  const visible = useMemo(() => {
    if (!meals) return [];
    const list = filterMealsByQuery(
      meals.filter((m) => mealMatchesFilter(m.meal, filter)),
      query,
    );
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

  const filterChips = useMemo(
    () =>
      buildMealFilterChips(
        (meals ?? []).map((m) => m.meal),
        profile?.custom_meal_categories,
      ),
    [meals, profile?.custom_meal_categories],
  );

  const sortLabel: Record<MealSort, string> = {
    recent: 'Recent',
    name: 'Name A-Z',
    calories: 'Calories',
    logged: 'Most logged',
  };

  const hasMeals = meals && meals.length > 0;

  return (
    <>
      {/* Starred shelf */}
      {hasMeals && (
        <StarredMealsShelf onLog={(meal) => setLogging(meal)} />
      )}

      {/* Controls area */}
      <div className="mx-auto max-w-md" style={{ padding: '0 22px' }}>
        {/* New meal button */}
        <div className="mb-3">
          <Button block variant="primary" onClick={() => setMenuOpen(true)}>
            <Plus className="h-4 w-4" />
            New meal
          </Button>
        </div>

        {hasMeals && (
          <>
            {/* Search bar */}
            <div
              className="relative mb-3"
              style={{ height: 42 }}
            >
              <Search
                size={15}
                strokeWidth={2}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: 13, color: 'var(--color-text-faint)' }}
              />
              <input
                type="search"
                placeholder="Search by name, note, or ingredient…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: 42,
                  borderRadius: 12,
                  border: 'none',
                  outline: 'none',
                  background: 'var(--color-search-bg)',
                  paddingLeft: 38,
                  paddingRight: 12,
                  fontSize: 13.5,
                  letterSpacing: '-0.01em',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Filter chips */}
            <div
              className="no-scrollbar mb-3"
              style={{
                display: 'flex',
                gap: 7,
                overflowX: 'auto',
                marginLeft: -22,
                paddingLeft: 22,
                marginRight: -22,
                paddingRight: 22,
              }}
            >
              {filterChips.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setFilter(chip.value)}
                  aria-pressed={filter === chip.value}
                  style={{
                    flexShrink: 0,
                    height: 30,
                    padding: '0 13px',
                    borderRadius: 15,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    background: filter === chip.value ? 'var(--color-accent)' : 'var(--color-chip-bg)',
                    color: filter === chip.value ? '#fff' : 'var(--color-text-muted)',
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Count + sort row */}
            <div className="mb-1 flex items-center justify-between">
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-faint)',
                  textTransform: 'uppercase',
                }}
              >
                {visible.length} {visible.length === 1 ? 'meal' : 'meals'}
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  className="flex items-center gap-1"
                  style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}
                >
                  {sortLabel[sort]}
                  <ChevronDown size={12} />
                </button>
                {sortOpen && (
                  <>
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      className="fixed inset-0 z-[55] cursor-default"
                      onClick={() => setSortOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-[56] mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
                      {(Object.entries(sortLabel) as [MealSort, string][]).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setSort(val); setSortOpen(false); }}
                          className={cn(
                            'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm',
                            sort === val ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {uncategorised.length > 0 && (
              <button
                type="button"
                onClick={() => setCategoriseOpen(true)}
                className="mb-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs text-primary hover:bg-primary/10"
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

        {/* Meal list */}
        {!meals ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : meals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <ChefHat className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
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
            {query.trim() ? `No meals match "${query}".` : 'No meals in this filter.'}
          </div>
        ) : (
          <ul>
            {visible.map(({ meal, totals, itemCount, servings }, idx) => {
              const cat = mealPrimaryCategory(meal);
              const CatIcon = CAT_ICON[cat] ?? ChefHat;
              return (
                <li
                  key={meal.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: idx < visible.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Thumbnail */}
                    {meal.image_url ? (
                      <img
                        src={meal.image_url}
                        alt=""
                        loading="lazy"
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 11,
                          objectFit: 'cover',
                          flexShrink: 0,
                          background: 'var(--color-thumb-bg)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 11,
                          background: 'var(--color-thumb-bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <CatIcon size={17} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)' }} />
                      </div>
                    )}

                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span
                          className="truncate"
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: '-0.01em',
                            color: 'var(--color-text)',
                          }}
                        >
                          {meal.name}
                        </span>
                        {meal.favorite && (
                          <Star
                            size={11}
                            strokeWidth={0}
                            style={{ flexShrink: 0, fill: 'var(--color-accent)', color: 'var(--color-accent)' }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {cat && (
                          <>
                            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                              {categoryLabel(cat)}
                            </span>
                            {' · '}
                          </>
                        )}
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                          {formatKcal(totals.kcal)}
                        </span>{' '}
                        kcal{servings > 1 ? '/portion' : ''}
                        {servings > 1 && ` · makes ${formatServings(servings)}`}
                        {!cat && `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · `}
                      </div>
                    </div>

                    {/* Log pill */}
                    <button
                      type="button"
                      onClick={() => setLogging(meal)}
                      style={{
                        background: 'var(--color-log-ghost)',
                        borderRadius: 9,
                        height: 32,
                        padding: '0 12px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'var(--color-accent-deep)',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                      }}
                    >
                      Log
                    </button>

                    {/* Star toggle */}
                    <button
                      type="button"
                      onClick={() => void toggleMealFavorite(meal.id)}
                      aria-label={meal.favorite ? `Unstar ${meal.name}` : `Star ${meal.name}`}
                      aria-pressed={!!meal.favorite}
                      style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)', flexShrink: 0 }}
                    >
                      <Star
                        size={14}
                        strokeWidth={meal.favorite ? 0 : 1.5}
                        style={{ fill: meal.favorite ? 'var(--color-accent)' : 'none', color: meal.favorite ? 'var(--color-accent)' : 'var(--color-text-faint)' }}
                      />
                    </button>

                    {/* Pencil */}
                    <button
                      type="button"
                      onClick={() => navigate(`/meals/${meal.id}/edit`)}
                      aria-label={`Edit ${meal.name}`}
                      style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)', flexShrink: 0 }}
                    >
                      <Pencil size={13} strokeWidth={2} style={{ color: 'var(--color-text-faint)' }} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <LogMealSheet open={logging !== null} meal={logging} onClose={() => setLogging(null)} />
      <RecipeScanSheet open={scanOpen} onClose={() => setScanOpen(false)} />
      <CategoriseSheet
        open={categoriseOpen}
        meals={uncategorised}
        logStats={logStats}
        onClose={() => setCategoriseOpen(false)}
      />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="New meal" fullScreenMobile={false}>
        <div className="space-y-2 p-4">
          <NewMealOption
            icon={<Plus className="h-4 w-4 text-primary" />}
            title="Blank meal"
            subtitle="Build it from scratch, ingredient by ingredient"
            onClick={() => { setMenuOpen(false); navigate('/meals/new'); }}
          />
          <NewMealOption
            icon={<ScanLine className="h-4 w-4 text-primary" />}
            title="Scan a recipe"
            subtitle="Turn a recipe screenshot into a ready-to-edit meal"
            onClick={() => { setMenuOpen(false); setScanOpen(true); }}
          />
          <NewMealOption
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="Plan with AI"
            subtitle="Turn your ingredients + targets into meal-prep recipes"
            onClick={() => { setMenuOpen(false); navigate('/meals/plan'); }}
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
