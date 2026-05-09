import { cn } from '@/lib/cn';

interface MacroRingProps {
  /** 0..1.5 — values >1 wrap visually as a tonal bar */
  value: number;
  /** centre headline e.g. "1,234" */
  label: string;
  /** small text under headline e.g. "kcal" */
  sublabel?: string;
  /** Tailwind colour token name (matches CSS var, e.g. 'kcal' / 'protein') */
  colorVar?: 'kcal' | 'protein' | 'carbs' | 'fat' | 'primary';
  /** ring + viewbox diameter */
  size?: number;
  /** stroke width relative to size */
  strokeWidth?: number;
  className?: string;
}

export function MacroRing({
  value,
  label,
  sublabel,
  colorVar = 'kcal',
  size = 132,
  strokeWidth = 12,
  className,
}: MacroRingProps) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const dashOffset = c * (1 - clamped);
  const overflow = value > 1;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={overflow ? 'hsl(var(--destructive))' : `hsl(var(--${colorVar}))`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 320ms ease-out' }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tabular-nums leading-none">{label}</div>
        {sublabel && (
          <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
