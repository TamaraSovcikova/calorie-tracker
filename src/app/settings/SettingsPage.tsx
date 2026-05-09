import { PageHeader } from '@/components/PageHeader';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-md px-4 py-4">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Goals, profile, and preferences come online in Phase 7.
        </div>
      </div>
    </>
  );
}
