import { useLiveQuery } from 'dexie-react-hooks';
import { Check } from 'lucide-react';
import { db } from '@/db/dexie';
import type { DiaryEntry, Food, Meal } from '@/db/types';
import { formatGrams, formatKcal, MACRO_LABELS, type MacroKey } from '@/lib/macros';
import { cn } from '@/lib/cn';

interface DiaryRowProps {
  entry: DiaryEntry;
  primaryMacro: MacroKey;
  onClick?: (entry: DiaryEntry) => void;
  /** Selection mode for the "build a meal from diary entries" flow. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (entry: DiaryEntry) => void;
}

function entryDisplayQty(entry: DiaryEntry): string {
  if (entry.kind === 'quick') return 'Calorie entry';
  if (entry.kind === 'meal') {
    const mult = entry.portion_multiplier ?? 1;
    if (mult === 1) return '1 serving';
    return `${formatGrams(mult)}× serving`;
  }
  if (entry.unit === 'g' || entry.unit === 'ml') {
    return `${Math.round(entry.qty)} ${entry.unit}`;
  }
  if (entry.unit === 'serving') {
    return entry.qty === 1 ? '1 serving' : `${formatGrams(entry.qty)} servings`;
  }
  // custom unit
  return `${formatGrams(entry.qty)} ${entry.unit}${entry.qty === 1 ? '' : 's'}`;
}

export function DiaryRow({
  entry,
  primaryMacro,
  onClick,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: DiaryRowProps) {
  const target = useLiveQuery<Food | Meal | undefined>(async () => {
    if (entry.kind === 'food' && entry.food_id) return db.foods.get(entry.food_id);
    if (entry.kind === 'meal' && entry.meal_id) return db.meals.get(entry.meal_id);
    return undefined;
  }, [entry.id, entry.food_id, entry.meal_id]);

  const name =
    target?.name ??
    (entry.kind === 'meal'
      ? 'Meal'
      : entry.kind === 'quick'
        ? 'Quick add'
        : 'Food');
  const macroVal =
    primaryMacro === 'protein'
      ? entry.protein
      : primaryMacro === 'carbs'
        ? entry.carbs
        : entry.fat;

  // Only plain food entries can become meal ingredients.
  const selectable = entry.kind === 'food' && !!entry.food_id;
  const handleClick = selectMode
    ? selectable
      ? () => onToggleSelect?.(entry)
      : undefined
    : onClick
      ? () => onClick(entry)
      : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={selectMode && !selectable}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors',
        selectMode && !selectable
          ? 'opacity-40'
          : 'hover:bg-muted/50 active:bg-muted',
      )}
    >
      {selectMode && (
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border',
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {entryDisplayQty(entry)}
          {entry.kind === 'meal' && ' • meal'}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="text-sm font-semibold">{formatKcal(entry.kcal)}</div>
        <div className="text-[11px] text-muted-foreground">
          {MACRO_LABELS[primaryMacro][0]} {Math.round(macroVal)}g
        </div>
      </div>
    </button>
  );
}
