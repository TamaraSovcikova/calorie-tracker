import { PageHeader } from '@/components/PageHeader';

export function ProgressPage() {
  return (
    <>
      <PageHeader title="Progress" subtitle="Weight, weekly summary, streak" />
      <div className="mx-auto max-w-md px-4 py-4">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Progress dashboard comes online in Phase 9.
        </div>
      </div>
    </>
  );
}
