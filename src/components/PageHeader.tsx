import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  /** Small uppercase line above the title. */
  eyebrow?: string;
  subtitle?: string;
  trailing?: ReactNode;
  /** When set, the title becomes a button (with a chevron) that calls this. */
  onTitleClick?: () => void;
  /** When set, a back arrow is shown before the title. */
  onBack?: () => void;
  /**
   * 'bar' (default) is the compact sticky bar used by Progress and Settings.
   * 'display' is the taller eyebrow-plus-large-title treatment Library used
   * to hand-roll. Both draw from the same type scale.
   */
  variant?: 'bar' | 'display';
  children?: ReactNode;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  trailing,
  onTitleClick,
  onBack,
  variant = 'bar',
  children,
}: PageHeaderProps) {
  if (variant === 'display') {
    return (
      <header
        className="sticky top-0 z-10 px-6 pt-8"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="mx-auto max-w-md">
          {eyebrow && (
            <div className="text-eyebrow uppercase" style={{ color: 'var(--color-text-faint)' }}>
              {eyebrow}
            </div>
          )}
          <h1 className="mt-1 text-title" style={{ color: 'var(--color-text)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
          {children}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="tap-target -ml-2 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="flex max-w-full items-center gap-1 text-left"
            >
              <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          )}
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
    </header>
  );
}
