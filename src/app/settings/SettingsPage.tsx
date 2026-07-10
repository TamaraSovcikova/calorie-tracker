import { PageHeader } from '@/components/PageHeader';
import { useProfile } from '@/db/repos/profile';
import { GoalsSection } from '@/features/settings/GoalsSection';
import { ProfileSection } from '@/features/settings/ProfileSection';
import { FitbitSection } from '@/features/settings/FitbitSection';
import { PreferencesSection } from '@/features/settings/PreferencesSection';
import { SyncSection } from '@/features/settings/SyncSection';
import { DataSection } from '@/features/settings/DataSection';
import { AboutSection } from '@/features/settings/AboutSection';

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-text-faint)',
        paddingLeft: 4,
        paddingBottom: 2,
      }}
    >
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const profile = useProfile();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-md animate-fade-in space-y-5 px-4 py-4 pb-8">
        {profile ? (
          <>
            <Group label="Tracking">
              <GoalsSection profile={profile} />
            </Group>

            <Group label="Profile">
              <ProfileSection profile={profile} />
            </Group>

            <Group label="Connections">
              <FitbitSection />
            </Group>

            <Group label="App">
              <PreferencesSection profile={profile} />
            </Group>

            <Group label="Data & Sync">
              <SyncSection />
              <DataSection />
            </Group>

            <AboutSection />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
      </div>
    </>
  );
}
