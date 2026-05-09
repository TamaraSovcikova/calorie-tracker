import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { MacroSummary } from '@/features/diary/MacroSummary';
import { DiarySectionView } from '@/features/diary/DiarySection';
import { AddFoodSheet } from '@/features/food-search/AddFoodSheet';
import { EditEntrySheet } from '@/features/food-search/EditEntrySheet';
import { ExerciseSection } from '@/features/exercise/ExerciseSection';
import { formatDayHeader, isToday, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import {
  groupBySection,
  sumTotals,
  useDiaryDay,
  ZERO_TOTALS,
} from '@/db/repos/diary';
import { useExerciseDay, totalBurned } from '@/db/repos/exercise';
import { useProfile } from '@/db/repos/profile';
import { MEAL_SECTIONS, type DiaryEntry, type MealSection } from '@/db/types';

export function DiaryPage() {
  const { date } = useParams<{ date?: LocalDate }>();
  const navigate = useNavigate();
  const currentDate: LocalDate = date ?? todayLocal();

  const profile = useProfile();
  const entries = useDiaryDay(currentDate);
  const exercise = useExerciseDay(currentDate);

  const [addingTo, setAddingTo] = useState<MealSection | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);

  const goToDate = (next: LocalDate) => {
    navigate(isToday(next) ? '/diary' : `/diary/${next}`);
  };

  const totals = entries ? sumTotals(entries) : ZERO_TOTALS;
  const grouped = entries
    ? groupBySection(entries)
    : { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const burned = exercise ? totalBurned(exercise) : 0;

  return (
    <>
      <PageHeader
        title={formatDayHeader(currentDate)}
        subtitle={isToday(currentDate) ? currentDate : undefined}
        trailing={
          <div className="flex items-center gap-1">
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
          </div>
        }
      />

      <div className="mx-auto max-w-md space-y-3 px-4 py-4">
        {profile && (
          <MacroSummary profile={profile} totals={totals} burnedKcal={burned} />
        )}

        {MEAL_SECTIONS.map((section) => (
          <DiarySectionView
            key={section}
            section={section}
            entries={grouped[section]}
            primaryMacro={profile?.primary_macro ?? 'protein'}
            onAdd={(s) => setAddingTo(s)}
            onEntryClick={(e) => setEditing(e)}
          />
        ))}

        <ExerciseSection date={currentDate} />
      </div>

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
    </>
  );
}
