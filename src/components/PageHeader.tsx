import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  /** When set, the title becomes a button (with a chevron) that calls this. */
  onTitleClick?: () => void;
}

export function PageHeader({ title, subtitle, trailing, onTitleClick }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
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
