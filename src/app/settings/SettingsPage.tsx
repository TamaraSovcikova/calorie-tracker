import { PageHeader } from '@/components/PageHeader';
import { useProfile } from '@/db/repos/profile';
import { GoalsSection } from '@/features/settings/GoalsSection';
import { ProfileSection } from '@/features/settings/ProfileSection';
import { FitbitSection } from '@/features/settings/FitbitSection';
import { PreferencesSection } from '@/features/settings/PreferencesSection';
import { SyncSection } from '@/features/settings/SyncSection';
import { DataSection } from '@/features/settings/DataSection';
import { AboutSection } from '@/features/settings/AboutSection';

export function SettingsPage() {
  const profile = useProfile();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-md animate-fade-in space-y-3 px-4 py-4">
        {profile ? (
          <>
            <GoalsSection profile={profile} />
            <ProfileSection profile={profile} />
            <FitbitSection />
            <PreferencesSection profile={profile} />
            <SyncSection />
            <DataSection />
            <AboutSection />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
    </>
  );
}
