import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertCircle,
  CalendarCheck,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  ListChecks,
  Loader2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ArcGauge } from '@/components/ArcGauge';
import { DiarySectionView } from '@/features/diary/DiarySection';
import { CopyDaySheet } from '@/features/diary/CopyDaySheet';
import { AddFoodSheet } from '@/features/food-search/AddFoodSheet';
import { EditEntrySheet } from '@/features/food-search/EditEntrySheet';
import { ExerciseSection } from '@/features/exercise/ExerciseSection';
import { useFitbitDailySync } from '@/features/fitbit/useFitbitDailySync';
import { useDogState } from '@/features/pet/useDogState';
import { getDogSrc } from '@/features/pet/Dog';
import { useDailyGreeting } from '@/features/pet/useDailyGreeting';
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
import { updateProfile, useProfile } from '@/db/repos/profile';
import {
  parseUntrackedDates,
  useWeeklyBudget,
} from '@/features/weekly-budget/weeklyBudget';
import { WeeklyDigestCard } from '@/features/digest/WeeklyDigestCard';
import { MEAL_SECTIONS, type DiaryEntry, type MealSection } from '@/db/types';

export function DiaryPage() {
  const { date } = useParams<{ date?: LocalDate }>();
  const navigate = useNavigate();
  const currentDate: LocalDate = date ?? todayLocal();

  const profile = useProfile();
  const entries = useDiaryDay(currentDate);
  const exercise = useExerciseDay(currentDate);
  const weekly = useWeeklyBudget(currentDate, profile);
  const { syncFailed: fitbitSyncFailed } = useFitbitDailySync(currentDate);

  const greeting = useDailyGreeting();
  const dog = useDogState({ greeting });

  const [addingTo, setAddingTo] = useState<MealSection | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

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
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch { /* fall through */ }
    }
    input.focus();
    input.click();
  };

  const onToday = isToday(currentDate);
  const untrackedDays = parseUntrackedDates(profile?.untracked_dates);
  const isUntracked = untrackedDays.has(currentDate);
  const toggleUntracked = () => {
    if (!profile) return;
    const next = new Set(untrackedDays);
    if (next.has(currentDate)) next.delete(currentDate);
    else next.add(currentDate);
    void updateProfile({ untracked_dates: JSON.stringify([...next].sort()) });
    setMenuOpen(false);
  };

  const loading = entries === undefined;
  const totals = entries ? sumTotals(entries) : ZERO_TOTALS;
  const grouped = entries
    ? groupBySection(entries)
    : { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const burned = exercise ? totalBurned(exercise) : 0;
  const foodEntryCount = entries
    ? entries.filter((e) => e.kind === 'food' && e.food_id).length
    : 0;

  const baseTarget = weekly ? weekly.adjustedTarget : (profile?.kcal_target ?? 2000);
  const effective = profile?.eat_back_burned ? baseTarget + burned : baseTarget;
  const remaining = Math.max(0, Math.round(effective - totals.kcal));

  const dogSrc = dog.ready ? getDogSrc(dog.pose) : undefined;

  const macroRows = [
    { key: 'protein', label: 'PROTEIN', value: Math.round(totals.protein), target: profile?.protein_g ?? 0 },
    { key: 'carbs',   label: 'CARBS',   value: Math.round(totals.carbs),   target: profile?.carbs_g ?? 0 },
    { key: 'fat',     label: 'FAT',     value: Math.round(totals.fat),     target: profile?.fat_g ?? 0 },
  ];

  return (
    <>
      {/* Hidden date input for native date picker */}
      <input
        ref={dateInputRef}
        type="date"
        value={currentDate}
        onChange={(e) => { if (e.target.value) goToDate(e.target.value as LocalDate); }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-12 h-0 w-0 opacity-0"
      />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-md px-6 pt-7">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => goToDate(shiftDate(currentDate, -1))}
            className="tap-target rounded-md p-2"
            style={{ color: 'var(--color-text-faint)' }}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={openDatePicker}
            className="flex flex-col items-center"
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: 'var(--color-text-faint)',
                textTransform: 'uppercase',
              }}
            >
              {format(fromLocalDate(currentDate), 'EEEE d MMMM')}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                marginTop: 4,
                color: 'var(--color-text)',
              }}
            >
              {onToday ? 'Today' : formatDayHeader(currentDate)}
            </div>
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => goToDate(shiftDate(currentDate, 1))}
              className="tap-target rounded-md p-2"
              style={{ color: 'var(--color-text-faint)' }}
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
                className="tap-target rounded-md p-2"
                style={{ color: 'var(--color-text-faint)' }}
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
                    {!onToday && (
                      <button
                        type="button"
                        onClick={() => { goToDate(todayLocal()); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                      >
                        Go to today
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setCopyOpen(true); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                    >
                      <CopyPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      Copy this day to…
                    </button>
                    {foodEntryCount > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSelectMode(true); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                      >
                        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                        Build a meal from foods
                      </button>
                    )}
                    {profile?.weekly_budget_enabled && (
                      <button
                        type="button"
                        onClick={toggleUntracked}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"
                      >
                        {isUntracked ? (
                          <CalendarCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <CalendarOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        {isUntracked ? 'Mark day as tracked' : 'Mark day as untracked'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Arc + macros ─────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-md flex-col items-center px-6" style={{ gap: 14 }}>
        {profile && (
          <div style={{ marginTop: 8 }}>
            <ArcGauge
              value={totals.kcal}
              max={effective}
              remaining={remaining}
              dogSrc={dogSrc}
            />
          </div>
        )}

        {dog.ready && (
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              marginTop: -4,
            }}
          >
            {dog.petName} · {dog.statusLine}
          </div>
        )}

        {profile && (
          <div style={{ display: 'flex', gap: 26, marginTop: 4 }}>
            {macroRows.map(({ key, label, value, target }) => (
              <div
                key={key}
                style={{
                  width: 78,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text)',
                  }}
                >
                  {value}
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 500,
                      color: 'var(--color-text-faint)',
                    }}
                  >
                    /{target}g
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 2,
                    borderRadius: 2,
                    background: 'var(--color-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 2,
                      background: 'var(--color-text)',
                      width: `${target > 0 ? Math.min(100, (value / target) * 100) : 0}%`,
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    color: 'var(--color-text-faint)',
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Body content ─────────────────────────────────────────── */}
      <div
        className={`mx-auto max-w-md animate-fade-in space-y-3 px-4 py-4 ${selectMode ? 'pb-24' : ''}`}
      >
        {/* Banners */}
        {selectMode && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Tap the foods you want, then{' '}
            <span className="font-medium text-foreground">Create meal</span>.
            Meal and quick-add entries can't be used as ingredients.
          </div>
        )}
        {isUntracked && !selectMode && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <CalendarOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This day is marked untracked — your weekly budget counts it as on-target, not by what's logged here.
            </span>
          </div>
        )}
        {onToday && fitbitSyncFailed && !selectMode && (
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="flex w-full items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-700 dark:text-amber-300"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Health sync couldn't connect — tap to go to Settings and reconnect.
            </span>
          </button>
        )}

        {!selectMode && onToday && <WeeklyDigestCard />}

        {/* Meal sections */}
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

      {/* Select mode action bar */}
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
