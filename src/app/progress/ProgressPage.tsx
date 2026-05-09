import { PageHeader } from '@/components/PageHeader';
import { useProfile } from '@/db/repos/profile';
import { StreakCard } from '@/features/progress/StreakCard';
import { WeeklySummarySection } from '@/features/progress/WeeklySummarySection';
import { WeightLogSection } from '@/features/progress/WeightLogSection';

export function ProgressPage() {
  const profile = useProfile();
  return (
    <>
      <PageHeader title="Progress" />
      <div className="mx-auto max-w-md space-y-3 px-4 py-4">
        <StreakCard />
        {profile && <WeeklySummarySection profile={profile} />}
        {profile && <WeightLogSection profile={profile} />}
      </div>
    </>
  );
}
