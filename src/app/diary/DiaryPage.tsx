import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { formatDayHeader, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';

const MEAL_SECTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;

export function DiaryPage() {
  const { date } = useParams<{ date?: LocalDate }>();
  const navigate = useNavigate();
  const currentDate: LocalDate = date ?? todayLocal();

  const goToDate = (next: LocalDate) => {
    navigate(next === todayLocal() ? '/diary' : `/diary/${next}`);
  };

  return (
    <>
      <PageHeader
        title={formatDayHeader(currentDate)}
        subtitle={currentDate}
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

      <div className="mx-auto max-w-md space-y-4 px-4 py-4">
        {/* Macro summary placeholder — fully implemented in Phase 3 */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Daily summary</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">— / — kcal</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Macro tracking comes online in Phase 3.
          </div>
        </div>

        {MEAL_SECTIONS.map((section) => (
          <section
            key={section}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">{section}</h2>
              <button
                type="button"
                className="rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground tap-target"
                disabled
                aria-label={`Add ${section}`}
              >
                + Add
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">No entries yet.</p>
          </section>
        ))}
      </div>
    </>
  );
}
