import { PageHeader } from '@/components/PageHeader';

export function MealsPage() {
  return (
    <>
      <PageHeader title="Meals" subtitle="Saved meal templates" />
      <div className="mx-auto max-w-md px-4 py-4">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Saved meals come online in Phase 6.
        </div>
      </div>
    </>
  );
}
