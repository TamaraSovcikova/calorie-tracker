import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  ListChecks,
  Loader2,
  MoreVertical,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { CoachTip } from '@/components/ui/CoachTip';
import { DogHero } from '@/features/pet/DogHero';
import { MacroSummary } from '@/features/diary/MacroSummary';
import { DiarySectionView } from '@/features/diary/DiarySection';
import { CopyDaySheet } from '@/features/diary/CopyDaySheet';
import { AddFoodSheet } from '@/features/food-search/AddFoodSheet';
import { EditEntrySheet } from '@/features/food-search/EditEntrySheet';
import { ExerciseSection } from '@/features/exercise/ExerciseSection';
import { useFitbitDailySync } from '@/features/fitbit/useFitbitDailySync';
import {
  formatDayHeader,
  fromLocalDate,
  isToday,
  shiftDate,
  todayLocal,
  type LocalDate,
} from '@/lib/dates';
import {
  groupBySection,
  sumTotals,
  useDiaryDay,
  ZERO_TOTALS,
} from '@/db/repos/diary';
import { useExerciseDay, totalBurned } from '@/db/repos/exercise';
import { useProfile } from '@/db/repos/profile';
import { useWeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import { MEAL_SECTIONS, type DiaryEntry, type MealSection } from '@/db/types';

export function DiaryPage() {
  const { date } = useParams<{ date?: LocalDate }>();
  const navigate = useNavigate();
  const currentDate: LocalDate = date ?? todayLocal();

  const profile = useProfile();
  const entries = useDiaryDay(currentDate);
  const exercise = useExerciseDay(currentDate);
  const weekly = useWeeklyBudget(currentDate, profile);

  // If Fitbit is connected, pulls daily calories burned and upserts an
  // exercise_entry row in the background. No-op when not connected.
  useFitbitDailySync(currentDate);

  const [addingTo, setAddingTo] = useState<MealSection | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Leaving the day cancels an in-progress selection.
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [currentDate]);

  const toggleSelect = (entry: DiaryEntry) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const createMealFromSelection = () => {
    if (!entries) return;
    const items = entries
      .filter((e) => selectedIds.has(e.id) && e.kind === 'food' && e.food_id)
      .map((e) => ({ food_id: e.food_id as string, qty: e.qty, unit: e.unit }));
    if (items.length === 0) return;
    navigate('/meals/new', { state: { prefillItems: items } });
  };

  const goToDate = (next: LocalDate) => {
    navigate(isToday(next) ? '/diary' : `/diary/${next}`);
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    // showPicker() is the reliable way to open the native picker from a
    // gesture; fall back to focus+click on older engines.
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    input.focus();
    input.click();
  };

  const onToday = isToday(currentDate);

  const loading = entries === undefined;
  const totals = entries ? sumTotals(entries) : ZERO_TOTALS;
  const grouped = entries
    ? groupBySection(entries)
    : { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const burned = exercise ? totalBurned(exercise) : 0;
  const foodEntryCount = entries
    ? entries.filter((e) => e.kind === 'food' && e.food_id).length
    : 0;

  return (
    <>
      <PageHeader
        title={formatDayHeader(currentDate)}
        subtitle={format(fromLocalDate(currentDate), 'EEEE, d MMMM yyyy')}
        onTitleClick={openDatePicker}
        trailing={
          <div className="flex items-center gap-1">
            {!onToday && (
              <button
                type="button"
                onClick={() => goToDate(todayLocal())}
                className="tap-target rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => goToDate(shiftDate(currentDate, -1))}
              className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => goToDate(shiftDate(currentDate, 1))}
              className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Next day"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="fixed inset-0 z-[55] cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-[56] mt-1 w-56 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setCopyOpen(true);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                    >
                      <CopyPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      Copy this day to…
                    </button>
                    {foodEntryCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectMode(true);
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                      >
                        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                        Build a meal from foods
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />
      <input
        ref={dateInputRef}
        type="date"
        value={currentDate}
        onChange={(e) => {
          if (e.target.value) goToDate(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-12 h-0 w-0 opacity-0"
      />

      <div
        className={`mx-auto max-w-md animate-fade-in space-y-3 px-4 py-4 ${selectMode ? 'pb-24' : ''}`}
      >
        {selectMode && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Tap the foods you want, then{' '}
            <span className="font-medium text-foreground">Create meal</span>.
            Meal and quick-add entries can't be used as ingredients.
          </div>
        )}
        {!selectMode && <DogHero />}
        {!selectMode && (
          <CoachTip id="diary-basics">
            Tap the date above to jump to any day. Use a section's{' '}
            <span className="font-medium text-foreground">Add</span> button to
            search, scan a barcode, or quick-add calories.
          </CoachTip>
        )}
        {profile && (
          <MacroSummary
            profile={profile}
            totals={totals}
            burnedKcal={burned}
            weekly={weekly}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading {formatDayHeader(currentDate).toLowerCase()}…
          </div>
        ) : (
          <>
            {MEAL_SECTIONS.map((section) => (
              <DiarySectionView
                key={section}
                section={section}
                entries={grouped[section]}
                primaryMacro={profile?.primary_macro ?? 'protein'}
                onAdd={(s) => setAddingTo(s)}
                onEntryClick={(e) => setEditing(e)}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}

            {!selectMode && <ExerciseSection date={currentDate} />}
          </>
        )}
      </div>

      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card p-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <Button type="button" variant="ghost" onClick={exitSelection}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              block
              disabled={selectedIds.size === 0}
              onClick={createMealFromSelection}
            >
              Create meal ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      <AddFoodSheet
        open={addingTo !== null}
        onClose={() => setAddingTo(null)}
        date={currentDate}
        section={addingTo ?? 'breakfast'}
      />
      <EditEntrySheet
        open={editing !== null}
        entry={editing}
        onClose={() => setEditing(null)}
      />
      <CopyDaySheet
        open={copyOpen}
        fromDate={currentDate}
        onClose={() => setCopyOpen(false)}
      />
    </>
  );
}
