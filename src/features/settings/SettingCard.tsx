import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SettingCardProps {
  title: string;
  description?: string;
  /** Whether the card starts expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible settings section. Collapsed by default so the Settings page
 * reads as a short list of headers rather than one long scroll.
 */
export function SettingCard({
  title,
  description,
  defaultOpen = false,
  children,
}: SettingCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}
