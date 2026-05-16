'use client';

import type { SeverityCount } from '@/lib/types';
import { SEVERITY_MAP } from '@/lib/constants';

interface SeverityDonutProps {
  data: SeverityCount[];
  total: number;
}

// Display order for severity levels
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'none'];

export default function SeverityDonut({ data, total }: SeverityDonutProps) {
  // Sort data by severity order
  const sorted = [...data].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const radius = 15.91549;

  let cumulativeOffset = 25; // start at 12 o'clock

  const segments = sorted.map((d) => {
    const pct = total > 0 ? (d.count / total) * 100 : 0;
    const config = SEVERITY_MAP[d.severity as keyof typeof SEVERITY_MAP] || SEVERITY_MAP.none;
    const segment = {
      severity: d.severity,
      pct,
      color: config.color,
      label: config.label,
      count: d.count,
      offset: cumulativeOffset,
    };
    cumulativeOffset -= pct;
    return segment;
  });

  // Separate actionable vs informational for the center label
  const actionable = sorted
    .filter((d) => d.severity !== 'none')
    .reduce((sum, d) => sum + d.count, 0);

  return (
    <div>
      <div className="relative w-[170px] h-[170px] mx-auto mb-3.5">
        <svg viewBox="0 0 42 42" width="170" height="170">
          <circle cx="21" cy="21" r={radius} fill="#fff" stroke="#F1F3F6" strokeWidth="4" />
          {segments.map((seg, i) => (
            seg.pct > 0 && (
              <circle
                key={i}
                cx="21"
                cy="21"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="4"
                strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                strokeDashoffset={seg.offset}
              />
            )
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[22px] font-bold text-gray-900">{total}</div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wider">Mentions</div>
          {actionable > 0 && (
            <div className="text-[11px] text-red-600 font-semibold mt-0.5">{actionable} flagged</div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="flex-1 text-gray-700">{seg.label}</span>
            <span className="text-gray-400 text-[12px] mr-1">
              {seg.pct > 0 ? `${seg.pct.toFixed(0)}%` : '-'}
            </span>
            <span className="text-gray-900 font-semibold w-6 text-right">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
