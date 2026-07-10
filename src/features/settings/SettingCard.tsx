import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SettingCardProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SettingCard({
  title,
  description,
  defaultOpen = false,
  children,
}: SettingCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex-1 text-[15px] font-semibold leading-tight">{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          style={{ color: 'var(--color-text-faint)' }}
        />
      </button>
      {open && (
        <div
          className="space-y-3 px-4 pb-4 pt-1"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {description && (
            <p className="pt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {description}
            </p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}
