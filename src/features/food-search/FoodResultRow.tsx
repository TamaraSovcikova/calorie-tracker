import { ChevronRight, Star, Tag } from 'lucide-react';
import type { Food } from '@/db/types';
import { formatKcal } from '@/lib/macros';
import { cn } from '@/lib/cn';

interface FoodResultRowProps {
  food: Food;
  onClick: (food: Food) => void;
  /** When provided, a ⭐ toggle replaces the chevron. */
  onToggleFavorite?: (food: Food) => void;
}

interface Pill {
  label: string;
  variant: 'usda' | 'usda-branded' | 'off' | 'custom' | 'curated';
}

function pillFor(food: Food): Pill | null {
  if (food.source === 'curated') {
    return { label: 'Common', variant: 'curated' };
  }
  if (food.source === 'custom') {
    return { label: 'Mine', variant: 'custom' };
  }
  if (food.source === 'usda') {
    if (food.usda_data_type === 'branded') {
      return { label: 'USDA · Brand', variant: 'usda-branded' };
    }
    return { label: 'USDA', variant: 'usda' };
  }
  if (food.source === 'off') {
    return { label: 'OFF', variant: 'off' };
  }
  return null;
}

const PILL_CLASSES: Record<Pill['variant'], string> = {
  curated: 'bg-primary/15 text-primary',
  usda: 'bg-primary/10 text-primary',
  'usda-branded': 'bg-muted text-muted-foreground',
  off: 'bg-muted text-muted-foreground',
  custom: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

export function FoodResultRow({
  food,
  onClick,
  onToggleFavorite,
}: FoodResultRowProps) {
  const pill = pillFor(food);
  return (
    <div className="flex items-center gap-0.5 rounded-lg hover:bg-muted/60">
      <button
        type="button"
        onClick={() => onClick(food)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-3 text-left active:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {food.source === 'custom' && (
              <Tag className="h-3 w-3 text-primary" strokeWidth={2.5} />
            )}
            <span className="truncate text-sm font-medium">{food.name}</span>
            {pill && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
                  PILL_CLASSES[pill.variant],
                )}
              >
                {pill.label}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {food.brand ? `${food.brand} · ` : ''}
            {formatKcal(food.kcal_100)} kcal · {Math.round(food.protein_100)}P{' '}
            {Math.round(food.carbs_100)}C {Math.round(food.fat_100)}F /100g
          </div>
        </div>
        {!onToggleFavorite && (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(food)}
          aria-label={food.favorite ? `Unstar ${food.name}` : `Star ${food.name}`}
          className="tap-target shrink-0 rounded-md p-2 text-muted-foreground hover:text-amber-500"
        >
          <Star
            className={cn(
              'h-4 w-4',
              food.favorite && 'fill-amber-400 text-amber-400',
            )}
          />
        </button>
      )}
    </div>
  );
}
