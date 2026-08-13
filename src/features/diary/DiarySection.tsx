import { useRef, useState, type ReactNode } from 'react';
import { CalendarPlus, Plus } from 'lucide-react';
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
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (entry: DiaryEntry) => void;
  /** When set, rows can be swiped left to copy that entry onto today. */
  onCopyToToday?: (entry: DiaryEntry) => void;
}

const SWIPE_TRIGGER = 72; // px of left-drag to fire the copy

/**
 * Wraps a diary row so a left-swipe reveals a "Copy to today" action and
 * fires it past the threshold. Vertical scrolling is preserved (touch-action
 * pan-y); a real drag suppresses the row's tap so it doesn't open the editor.
 */
function SwipeToCopy({
  onCopy,
  children,
}: {
  onCopy: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    moved.current = false;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 6) moved.current = true;
    // Left-drag only; clamp so it can't be flung too far.
    setDx(Math.max(-110, Math.min(0, delta)));
  };
  const end = () => {
    if (dx <= -SWIPE_TRIGGER) onCopy();
    setDx(0);
    setDragging(false);
    startX.current = null;
  };

  return (
    <div className="relative overflow-hidden">
      <div
        className="absolute inset-y-0 right-0 flex items-center gap-1 pl-6 pr-4 text-xs font-semibold text-white"
        style={{ background: 'var(--color-accent-deep)' }}
      >
        <CalendarPlus className="h-4 w-4" />
        Today
      </div>
      {/* Without a hint this gesture was undiscoverable - nothing on the row
          suggested it existed, so it was only ever found by accident. A thin
          grip at the trailing edge shows there is something to pull, and
          fades out once the drag is under way so it does not fight the
          revealed action. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-1 z-10 flex flex-col items-center justify-center gap-[3px]"
        style={{
          opacity: dx < -4 ? 0 : 0.5,
          transition: 'opacity 0.15s ease',
        }}
      >
        {[0, 1].map((i) => (
          <span
            key={i}
            style={{
              width: 2,
              height: 9,
              borderRadius: 1,
              background: 'var(--color-text-faint)',
            }}
          />
        ))}
      </div>
      <div
        className="relative bg-card"
        style={{
          touchAction: 'pan-y',
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DiarySectionView({
  section,
  entries,
  primaryMacro,
  onAdd,
  onEntryClick,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onCopyToToday,
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
        {!selectMode && (
          <button
            type="button"
            onClick={() => onAdd(section)}
            aria-label={`Add to ${SECTION_TITLES[section]}`}
            className="tap-target flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Add
          </button>
        )}
      </header>
      {hasEntries && (
        <ul className="divide-y divide-border px-2 pb-2">
          {entries.map((e) => {
            const row = (
              <DiaryRow
                entry={e}
                primaryMacro={primaryMacro}
                onClick={onEntryClick}
                selectMode={selectMode}
                selected={selectedIds?.has(e.id) ?? false}
                onToggleSelect={onToggleSelect}
              />
            );
            return (
              <li key={e.id}>
                {onCopyToToday && !selectMode ? (
                  <SwipeToCopy onCopy={() => onCopyToToday(e)}>{row}</SwipeToCopy>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
