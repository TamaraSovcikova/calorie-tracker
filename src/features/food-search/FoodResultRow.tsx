import { ChevronRight, Tag } from 'lucide-react';
import type { Food } from '@/db/types';
import { formatKcal } from '@/lib/macros';

interface FoodResultRowProps {
  food: Food;
  onClick: (food: Food) => void;
}

export function FoodResultRow({ food, onClick }: FoodResultRowProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(food)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted/60 active:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {food.source === 'custom' && (
            <Tag className="h-3 w-3 text-primary" strokeWidth={2.5} />
          )}
          <span className="truncate text-sm font-medium">{food.name}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {food.brand ? `${food.brand} · ` : ''}
          {formatKcal(food.kcal_100)} kcal · {Math.round(food.protein_100)}P{' '}
          {Math.round(food.carbs_100)}C {Math.round(food.fat_100)}F /100g
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
