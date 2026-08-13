import { cn } from '@/lib/cn';

/**
 * The time-range picker used by every chart on Progress.
 *
 * The nutrition summary and the weight log each hand-rolled their own,
 * near-identical down to the border radius, which is how they ended up with
 * different spans (7/14/30 days vs 1M/3M/6M/1Y/ALL) and no accessible
 * grouping. One control, so a future chart inherits both.
 *
 * Not folded into SegmentedControl: these are compact standalone pills that
 * sit inside a card header, not a full-width segmented row.
 */
interface RangePillsProps<T extends string | number> {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  /** Names the group for assistive tech, e.g. "Nutrition range". */
  label: string;
  className?: string;
}

export function RangePills<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
}: RangePillsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex flex-wrap gap-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'tap-target rounded-full border px-3 text-xs font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
