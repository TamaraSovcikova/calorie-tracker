import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import type { DiaryEntry, Food, Meal } from '@/db/types';
import { formatGrams, formatKcal, MACRO_LABELS, type MacroKey } from '@/lib/macros';

interface DiaryRowProps {
  entry: DiaryEntry;
  primaryMacro: MacroKey;
  onClick?: (entry: DiaryEntry) => void;
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

export function DiaryRow({ entry, primaryMacro, onClick }: DiaryRowProps) {
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

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(entry) : undefined}
      className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
    >
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
