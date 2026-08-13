interface ArcGaugeProps {
  value: number;
  max: number;
  remaining: number;
  size?: number;
  strokeWidth?: number;
}

export function ArcGauge({
  value,
  max,
  remaining,
  size = 236,
  strokeWidth = 5,
}: ArcGaugeProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 0.75;
  const arcLength = arcFraction * circumference;
  const fillLength = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * arcLength;
  const isOver = value > max;
  const overage = Math.round(value - max);

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(135deg)' }}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={isOver ? 'hsl(var(--over))' : 'var(--color-accent)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${fillLength} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>

      {/* Centre content */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        aria-label={isOver ? `${overage} kcal over` : `${remaining} kcal remaining`}
      >
        <div style={{ marginTop: -26, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 300,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              color: isOver ? 'hsl(var(--over))' : 'var(--color-text)',
            }}
          >
            {isOver ? fmt(overage) : fmt(remaining)}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: isOver ? 'hsl(var(--over))' : 'var(--color-accent)',
              marginTop: 6,
              textTransform: 'uppercase',
            }}
          >
            {isOver ? 'KCAL OVER' : 'KCAL LEFT'}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-muted)',
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmt(value)} of {fmt(max)}
          </div>
        </div>
      </div>

      {/* Scale labels */}
      <span
        style={{
          position: 'absolute',
          left: 28,
          bottom: 24,
          fontSize: 10.5,
          fontWeight: 600,
          color: 'var(--color-text-faint)',
        }}
      >
        0
      </span>
      <span
        style={{
          position: 'absolute',
          right: 24,
          bottom: 24,
          fontSize: 10.5,
          fontWeight: 600,
          color: 'var(--color-text-faint)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {(max / 1000).toFixed(1)}k
      </span>
    </div>
  );
}
