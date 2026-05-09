import { useMemo } from 'react';
import { cn } from '@/lib/cn';

export interface ChartPoint {
  /** ms since epoch */
  x: number;
  y: number;
  /** Optional secondary y for moving-average overlay. */
  yAvg?: number;
}

interface MiniChartProps {
  points: ChartPoint[];
  /** ms since epoch for x-axis tick formatting. */
  formatX?: (ms: number) => string;
  formatY?: (n: number) => string;
  height?: number;
  /** Tailwind colour token used for the main stroke + dots */
  colorVar?: 'primary' | 'kcal' | 'protein' | 'carbs' | 'fat';
  className?: string;
  /** When provided draws a horizontal target reference line. */
  target?: number;
}

const PADDING = { top: 12, right: 12, bottom: 22, left: 32 };

export function MiniChart({
  points,
  formatX,
  formatY,
  height = 180,
  colorVar = 'primary',
  className,
  target,
}: MiniChartProps) {
  const computed = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y).filter((y) => Number.isFinite(y));
    if (ys.length === 0) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    let minY = Math.min(...ys, target ?? Infinity);
    let maxY = Math.max(...ys, target ?? -Infinity);
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    } else {
      const pad = (maxY - minY) * 0.1;
      minY -= pad;
      maxY += pad;
    }
    return { minX, maxX, minY, maxY };
  }, [points, target]);

  if (!computed) {
    return (
      <div
        style={{ height }}
        className={cn(
          'flex items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground',
          className,
        )}
      >
        No data yet
      </div>
    );
  }

  const width = 360; // viewBox width — chart scales by container
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const xRange = computed.maxX - computed.minX || 1;
  const yRange = computed.maxY - computed.minY || 1;

  const sx = (x: number) =>
    PADDING.left + ((x - computed.minX) / xRange) * innerW;
  const sy = (y: number) =>
    PADDING.top + (1 - (y - computed.minY) / yRange) * innerH;

  const linePath = points
    .filter((p) => Number.isFinite(p.y))
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
    .join(' ');
  const avgPoints = points.filter((p) => p.yAvg !== undefined);
  const avgPath = avgPoints
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(2)} ${sy(p.yAvg!).toFixed(2)}`,
    )
    .join(' ');

  // y axis ticks: 4 evenly spaced
  const yTicks = [0, 1, 2, 3].map(
    (i) => computed.minY + (yRange * i) / 3,
  );
  // x axis: first, middle, last
  const xTickValues = [
    computed.minX,
    (computed.minX + computed.maxX) / 2,
    computed.maxX,
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      style={{ height }}
    >
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={sy(t)}
            y2={sy(t)}
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
          />
          <text
            x={PADDING.left - 6}
            y={sy(t)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {formatY ? formatY(t) : t.toFixed(1)}
          </text>
        </g>
      ))}

      {target !== undefined && (
        <line
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={sy(target)}
          y2={sy(target)}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="2 4"
          opacity={0.6}
        />
      )}

      {avgPath && (
        <path
          d={avgPath}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      <path
        d={linePath}
        fill="none"
        stroke={`hsl(var(--${colorVar}))`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points
        .filter((p) => Number.isFinite(p.y))
        .map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={2.5}
            fill={`hsl(var(--${colorVar}))`}
          />
        ))}

      {xTickValues.map((t, i) => (
        <text
          key={i}
          x={sx(t)}
          y={height - 4}
          textAnchor={i === 0 ? 'start' : i === xTickValues.length - 1 ? 'end' : 'middle'}
          className="fill-muted-foreground"
          fontSize="10"
        >
          {formatX ? formatX(t) : new Date(t).toISOString().slice(0, 10)}
        </text>
      ))}
    </svg>
  );
}
