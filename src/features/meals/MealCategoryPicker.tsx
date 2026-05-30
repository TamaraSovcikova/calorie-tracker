import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MEAL_CATEGORIES, categoryLabel, toCategoryToken } from './mealCategory';

interface MealCategoryPickerProps {
  /** Selected category tokens. */
  value: string[];
  onChange: (categories: string[]) => void;
  /** User-created category tokens, shown alongside the built-ins. */
  customCategories: string[];
  /** Called when the user creates a new custom category (already tokenised). */
  onAddCustom: (token: string) => void;
  /** Shown as a hint when the value is an unconfirmed auto-suggestion. */
  suggested?: boolean;
  className?: string;
}

/**
 * Multi-select category control. A meal can belong to several categories
 * (e.g. both lunch and dinner). Users can add their own categories inline.
 */
export function MealCategoryPicker({
  value,
  onChange,
  customCategories,
  onAddCustom,
  suggested,
  className,
}: MealCategoryPickerProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const selected = new Set(value);
  // Built-ins first, then custom, de-duped.
  const tokens = [
    ...MEAL_CATEGORIES,
    ...customCategories.filter((c) => !(MEAL_CATEGORIES as readonly string[]).includes(c)),
  ];

  const toggle = (token: string) => {
    const next = new Set(value);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    onChange([...next]);
  };

  const commitNew = () => {
    const token = toCategoryToken(draft);
    if (token) {
      onAddCustom(token);
      if (!selected.has(token)) onChange([...value, token]);
    }
    setDraft('');
    setAdding(false);
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Categories
        </span>
        {suggested && value.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            suggested · tap to change
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((token) => {
          const active = selected.has(token);
          return (
            <button
              key={token}
              type="button"
              onClick={() => toggle(token)}
              aria-pressed={active}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : suggested && active
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {categoryLabel(token)}
            </button>
          );
        })}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitNew();
              } else if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            placeholder="New category"
            maxLength={24}
            className="w-32 rounded-full border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        )}
      </div>
    </div>
  );
}
