import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The one segmented control.
 *
 * There were three: `ui/Tabs` (add-food sheet, ingredient picker), a pill
 * switcher hand-rolled in LibraryPage, and an inline-styled variant repeated
 * across ProfileSection / PreferencesSection / GoalsSection. Same control,
 * three implementations, and only the first had any ARIA - the other two were
 * anonymous buttons to a screen reader.
 *
 * Two variants, because the app genuinely uses two treatments:
 *  - `track` (default): a recessed track with a raised active segment. For
 *    switching between views of the same kind (tabs, Meals vs Foods).
 *  - `solid`: a bordered row with the active segment filled in accent. For
 *    picking a setting value (sex, units, theme, budget mode).
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  /** Pass '' (or a value not in `options`) for "nothing selected". */
  value: T | '';
  onChange: (next: T) => void;
  /** When set, clicking the already-active segment clears the selection
   *  instead of doing nothing. Used where the value is genuinely optional,
   *  e.g. Sex in the profile (it only feeds the TDEE estimate). */
  onDeselect?: () => void;
  options: SegmentedOption<T>[];
  /** Visible label above the control; also names it for assistive tech. */
  label?: string;
  /** Accessible name when no visible label is wanted. */
  'aria-label'?: string;
  variant?: 'track' | 'solid';
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  onDeselect,
  options,
  label,
  'aria-label': ariaLabel,
  variant = 'track',
  className,
}: SegmentedControlProps<T>) {
  const control = (
    <div
      role="tablist"
      aria-label={ariaLabel ?? label}
      className={cn(
        'flex',
        variant === 'track'
          ? 'gap-0.5 rounded-xl p-[3px]'
          : 'overflow-hidden rounded-lg border border-border',
        className,
      )}
      style={
        variant === 'track'
          ? { background: 'var(--color-tab-track)' }
          : undefined
      }
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() =>
              active && onDeselect ? onDeselect() : onChange(opt.value)
            }
            className={cn(
              'tap-target flex-1 px-3 text-sm font-medium transition-colors',
              variant === 'track' ? 'rounded-[9px]' : '',
            )}
            style={{
              background: active
                ? variant === 'track'
                  ? 'var(--color-tab-active)'
                  : 'var(--color-accent-deep)'
                : 'transparent',
              color: active
                ? variant === 'track'
                  ? 'var(--color-text)'
                  : '#fff'
                : 'var(--color-text-muted)',
              fontWeight: active ? 600 : 500,
              borderRight:
                variant === 'solid' && i < options.length - 1
                  ? '1px solid var(--color-border)'
                  : undefined,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  if (!label) return control;
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {control}
    </div>
  );
}
