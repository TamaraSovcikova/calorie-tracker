import { cn } from '@/lib/cn';
import type { MealCategory } from '@/db/types';
import { CATEGORY_LABEL, MEAL_CATEGORIES } from './mealCategory';

interface MealCategoryPickerProps {
  value: MealCategory | undefined;
  onChange: (category: MealCategory) => void;
  /** Shown as a hint when the value is an unconfirmed auto-suggestion. */
  suggested?: boolean;
  className?: string;
}

/** A compact segmented control for picking a meal's category. */
export function MealCategoryPicker({
  value,
  onChange,
  suggested,
  className,
}: MealCategoryPickerProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Category
        </span>
        {suggested && value && (
          <span className="text-[10px] text-muted-foreground">
            suggested · tap to change
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MEAL_CATEGORIES.map((cat) => {
          const active = value === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onChange(cat)}
              aria-pressed={active}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : suggested && value === cat
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
