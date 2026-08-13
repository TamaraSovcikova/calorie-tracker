import { PageHeader } from '@/components/PageHeader';
import { useProfile } from '@/db/repos/profile';
import { WeeklyBudgetCard } from '@/features/weekly-budget/WeeklyBudgetCard';
import { useWeeklyBudget } from '@/features/weekly-budget/weeklyBudget';
import { WeeklySummarySection } from '@/features/progress/WeeklySummarySection';
import { WeightLogSection } from '@/features/progress/WeightLogSection';
import { todayLocal } from '@/lib/dates';

/**
 * Progress reads shortest horizon first: where you stand in the current
 * budget period, then the last N days of nutrition, then weight over months.
 *
 * The budget card used to live on the pet page, which has no nav entry - so
 * the only explanation of carry-over, the trim cap and the running balance
 * sat behind a tap on the dog's caption. It belongs on the screen whose job
 * is answering "how am I doing".
 */
export function ProgressPage() {
  const profile = useProfile();
  const weekly = useWeeklyBudget(todayLocal(), profile);

  return (
    <>
      <PageHeader title="Progress" />
      <div className="mx-auto max-w-md animate-fade-in space-y-5 px-4 py-4">
        {weekly && (
          <section className="space-y-2">
            <SectionLabel>Right now</SectionLabel>
            <WeeklyBudgetCard weekly={weekly} />
          </section>
        )}

        {profile && (
          <section className="space-y-2">
            <SectionLabel>Recent days</SectionLabel>
            <WeeklySummarySection profile={profile} />
          </section>
        )}

        {profile && (
          <section className="space-y-2">
            <SectionLabel>Over time</SectionLabel>
            <WeightLogSection profile={profile} />
          </section>
        )}
      </div>
    </>
  );
}

/** Plain label naming the time horizon each group covers. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-eyebrow uppercase"
      style={{ color: 'var(--color-text-faint)' }}
    >
      {children}
    </h2>
  );
}
