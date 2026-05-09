import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TabsProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1 rounded-lg border border-border bg-muted/40 p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors tap-target',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
