import { PageHeader } from '@/components/PageHeader';
import { useProfile } from '@/db/repos/profile';
import { WeeklySummarySection } from '@/features/progress/WeeklySummarySection';
import { WeightLogSection } from '@/features/progress/WeightLogSection';

export function ProgressPage() {
  const profile = useProfile();
  return (
    <>
      <PageHeader title="Progress" />
      <div className="mx-auto max-w-md animate-fade-in space-y-3 px-4 py-4">
        {profile && <WeeklySummarySection profile={profile} />}
        {profile && <WeightLogSection profile={profile} />}
      </div>
    </>
  );
}
