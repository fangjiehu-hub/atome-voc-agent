'use client';

import type { TrendPoint } from '@/lib/types';

interface TrendChartProps {
  data: TrendPoint[];
  selectedDate?: string | null;
  onDateClick?: (date: string) => void;
}

export default function TrendChart({ data, selectedDate, onDateClick }: TrendChartProps) {
  if (!data.length) {
    return <div className="h-[220px] flex items-center justify-center text-gray-400">No trend data</div>;
  }

  const rawMax = Math.max(...data.map((d) => d.total), 1);
  const maxTotal = niceMax(rawMax);
  const w = 620;
  const h = 240;
  const padding = { top: 20, right: 20, bottom: 32, left: 44 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;

  const toY = (val: number) => padding.top + chartH - (val / maxTotal) * chartH;
  const toX = (i: number) => padding.left + i * xStep;

  // Y-axis tick values
  const yTicks = computeYTicks(maxTotal);

  // Decide how many X-axis labels to show based on data density
  const labelEvery = data.length <= 10 ? 1 : data.length <= 20 ? 2 : data.length <= 40 ? 5 : 7;
  // Only show value labels on dots when <= 14 days
  const showDotValues = data.length <= 14;
  // Only show individual dots when <= 31 days
  const showDots = data.length <= 31;

  // Severity line configs
  const lines = [
    { key: 'critical' as const, color: '#DC2626', width: 1.8 },
    { key: 'high' as const, color: '#F97316', width: 1.8 },
    { key: 'medium' as const, color: '#F59E0B', width: 1.8 },
    { key: 'low' as const, color: '#10B981', width: 1.8 },
  ];

  const severityLines = lines.map((line) => ({
    ...line,
    points: data.map((d, i) => `${toX(i)},${toY(d[line.key])}`).join(' '),
    hasData: data.some((d) => d[line.key] > 0),
  }));

  const totalPoints = data.map((d, i) => `${toX(i)},${toY(d.total)}`).join(' ');

  // Build filled area under total line
  const areaPath = `M${toX(0)},${toY(data[0].total)} ` +
    data.map((d, i) => `L${toX(i)},${toY(d.total)}`).join(' ') +
    ` L${toX(data.length - 1)},${toY(0)} L${toX(0)},${toY(0)} Z`;

  // Hit zone width for each data point
  const hitW = data.length > 1 ? xStep : chartW;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis grid + labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={toY(tick)}
              x2={w - padding.right}
              y2={toY(tick)}
              stroke="#E5E7EB"
              strokeDasharray="3 3"
            />
            <text
              x={padding.left - 8}
              y={toY(tick) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="#9CA3AF"
            >
              {tick}
            </text>
          </g>
        ))}
        {/* Baseline */}
        <line
          x1={padding.left}
          y1={toY(0)}
          x2={w - padding.right}
          y2={toY(0)}
          stroke="#E5E7EB"
        />
        <text
          x={padding.left - 8}
          y={toY(0) + 3.5}
          textAnchor="end"
          fontSize="10"
          fill="#9CA3AF"
        >
          0
        </text>

        {/* Selected date highlight column */}
        {selectedDate && (() => {
          const idx = data.findIndex((d) => d.date === selectedDate);
          if (idx < 0) return null;
          return (
            <rect
              x={toX(idx) - hitW / 2}
              y={padding.top}
              width={hitW}
              height={chartH}
              fill="#141c30"
              opacity={0.08}
              rx={3}
            />
          );
        })()}

        {/* Filled area under total */}
        <path d={areaPath} fill="#141c30" opacity="0.06" />

        {/* Severity lines (behind total) */}
        {severityLines
          .filter((l) => l.hasData)
          .map((line) => (
            <g key={line.key}>
              <polyline
                fill="none"
                stroke={line.color}
                strokeWidth={line.width}
                strokeOpacity={0.7}
                points={line.points}
                strokeLinejoin="round"
              />
              {showDots && data.map(
                (d, i) =>
                  d[line.key] > 0 && (
                    <circle
                      key={i}
                      cx={toX(i)}
                      cy={toY(d[line.key])}
                      r="2.5"
                      fill={line.color}
                    />
                  )
              )}
            </g>
          ))}

        {/* Total line (on top) */}
        <polyline
          fill="none"
          stroke="#141c30"
          strokeWidth="2.5"
          points={totalPoints}
          strokeLinejoin="round"
        />
        {showDots && data.map((d, i) => {
          const isSelected = d.date === selectedDate;
          return (
            <g key={d.date}>
              <circle
                cx={toX(i)}
                cy={toY(d.total)}
                r={isSelected ? 6 : showDotValues ? 4 : 2.5}
                fill={isSelected ? '#141c30' : '#141c30'}
                stroke={isSelected ? '#fff' : 'none'}
                strokeWidth={isSelected ? 2 : 0}
              />
              {showDotValues && d.total > 0 && (
                <text
                  x={toX(i)}
                  y={toY(d.total) - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={isSelected ? '#141c30' : '#374151'}
                >
                  {d.total}
                </text>
              )}
            </g>
          );
        })}

        {/* Invisible click zones for each data point */}
        {onDateClick && data.map((d, i) => (
          <rect
            key={`hit-${d.date}`}
            x={toX(i) - hitW / 2}
            y={padding.top}
            width={hitW}
            height={chartH + padding.bottom}
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onDateClick(d.date)}
          />
        ))}

        {/* X labels — show every Nth label */}
        {data.map((d, i) => {
          // Always show first, last, and every Nth
          const isFirst = i === 0;
          const isLast = i === data.length - 1;
          const isNth = i % labelEvery === 0;
          if (!isFirst && !isLast && !isNth) return null;
          const isSelected = d.date === selectedDate;
          return (
            <text
              key={d.date}
              x={toX(i)}
              y={h - 5}
              textAnchor="middle"
              fontSize="10.5"
              fill={isSelected ? '#141c30' : '#9CA3AF'}
              fontWeight={isSelected ? '700' : '400'}
            >
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>

      <div className="flex gap-3.5 flex-wrap mt-2 items-center">
        {[
          { label: 'Total trend', color: '#141c30' },  /* Atome navy */
          { label: 'S4 Critical', color: '#DC2626' },
          { label: 'S3 High', color: '#F97316' },
          { label: 'S2 Medium', color: '#F59E0B' },
          { label: 'S1 Low', color: '#10B981' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
        {onDateClick && (
          <span className="ml-auto text-[10.5px] text-gray-400">
            Click a data point to drill down
          </span>
        )}
      </div>
    </div>
  );
}

function niceMax(raw: number): number {
  if (raw <= 5) return Math.max(raw + 2, 5);
  if (raw <= 10) return 10;
  if (raw <= 20) return 20;
  if (raw <= 50) return Math.ceil(raw / 10) * 10;
  if (raw <= 100) return Math.ceil(raw / 20) * 20;
  return Math.ceil(raw / 50) * 50;
}

function computeYTicks(max: number): number[] {
  if (max <= 5) return [1, 2, 3, 4, 5].filter((v) => v <= max);
  if (max <= 10) return [2, 4, 6, 8, 10];
  if (max <= 20) return [5, 10, 15, 20];
  const step = max <= 50 ? 10 : max <= 100 ? 20 : 50;
  const ticks: number[] = [];
  for (let v = step; v <= max; v += step) ticks.push(v);
  return ticks;
}
