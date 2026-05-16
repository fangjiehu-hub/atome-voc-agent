'use client';

import type { TimeRange } from '@/lib/types';

interface Preset {
  label: string;
  days: number;
}

const DEFAULT_PRESETS: Preset[] = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

interface DateRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  presets?: Preset[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function DateRangeSelector({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: DateRangeSelectorProps) {
  const isCustom = value.mode === 'custom';

  const handleCustomClick = () => {
    if (isCustom) return;
    onChange({ mode: 'custom', since: daysAgoStr(7), until: todayStr() });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1.5 bg-white p-1 border border-gray-200 rounded-[10px]">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => onChange({ mode: 'preset', days: p.days })}
            className={`px-3 py-1.5 text-[12.5px] rounded-md ${
              !isCustom && value.mode === 'preset' && value.days === p.days
                ? 'bg-brand-500 text-white font-semibold'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={handleCustomClick}
          className={`px-3 py-1.5 text-[12.5px] rounded-md ${
            isCustom
              ? 'bg-brand-500 text-white font-semibold'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Custom
        </button>
      </div>

      {isCustom && (
        <div className="flex items-center gap-1.5 text-[12.5px]">
          <input
            type="date"
            value={value.since}
            max={value.until}
            onChange={(e) =>
              onChange({ mode: 'custom', since: e.target.value, until: value.until })
            }
            className="border border-gray-200 rounded-md px-2 py-1.5 text-[12.5px] text-gray-700 bg-white"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={value.until}
            min={value.since}
            max={todayStr()}
            onChange={(e) =>
              onChange({ mode: 'custom', since: value.since, until: e.target.value })
            }
            className="border border-gray-200 rounded-md px-2 py-1.5 text-[12.5px] text-gray-700 bg-white"
          />
        </div>
      )}
    </div>
  );
}
