import { cn } from '@/lib/cn';

interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  unit?: string;
  colorVar: 'kcal' | 'protein' | 'carbs' | 'fat';
  className?: string;
}

export function MacroBar({
  label,
  value,
  target,
  unit = 'g',
  colorVar,
  className,
}: MacroBarProps) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const overflow = target > 0 && value > target;
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-medium text-foreground">{Math.round(value)}</span>
          <span className="text-muted-foreground">
            {' / '}
            {target}
            {unit}
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${pct * 100}%`,
            backgroundColor: overflow
              ? 'hsl(var(--destructive))'
              : `hsl(var(--${colorVar}))`,
          }}
        />
      </div>
    </div>
  );
}
