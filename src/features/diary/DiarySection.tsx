import { Plus } from 'lucide-react';
import { DiaryRow } from './DiaryRow';
import { formatKcal, MACRO_LABELS, type MacroKey } from '@/lib/macros';
import { sumTotals } from '@/db/repos/diary';
import type { DiaryEntry, MealSection } from '@/db/types';

const SECTION_TITLES: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

interface DiarySectionProps {
  section: MealSection;
  entries: DiaryEntry[];
  primaryMacro: MacroKey;
  onAdd: (section: MealSection) => void;
  onEntryClick?: (entry: DiaryEntry) => void;
}

export function DiarySectionView({
  section,
  entries,
  primaryMacro,
  onAdd,
  onEntryClick,
}: DiarySectionProps) {
  const totals = sumTotals(entries);
  const primaryVal =
    primaryMacro === 'protein'
      ? totals.protein
      : primaryMacro === 'carbs'
        ? totals.carbs
        : totals.fat;

  const hasEntries = entries.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">{SECTION_TITLES[section]}</h2>
          {hasEntries && (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">
                {formatKcal(totals.kcal)}
              </span>{' '}
              kcal
              <span className="mx-1.5">·</span>
              {Math.round(primaryVal)}g {MACRO_LABELS[primaryMacro]}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAdd(section)}
          aria-label={`Add to ${SECTION_TITLES[section]}`}
          className="tap-target flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Add
        </button>
      </header>
      {hasEntries && (
        <ul className="divide-y divide-border px-2 pb-2">
          {entries.map((e) => (
            <li key={e.id}>
              <DiaryRow entry={e} primaryMacro={primaryMacro} onClick={onEntryClick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
