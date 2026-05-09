import type { ReactNode } from 'react';

interface SettingCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingCard({ title, description, children }: SettingCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
