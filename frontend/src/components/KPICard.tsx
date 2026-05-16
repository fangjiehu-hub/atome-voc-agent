interface KPICardProps {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: string;
  deltaDirection?: 'up' | 'down' | 'neutral';
  critical?: boolean;
}

export default function KPICard({ label, value, suffix, delta, deltaDirection = 'neutral', critical }: KPICardProps) {
  const deltaColor = {
    up: 'text-red-600',
    down: 'text-emerald-600',
    neutral: 'text-gray-500',
  }[deltaDirection];

  return (
    <div
      className={`bg-white rounded-[14px] p-4 border shadow-sm ${
        critical ? 'border-red-300 bg-gradient-to-br from-red-50 to-white' : 'border-gray-200'
      }`}
    >
      <div className="text-xs text-gray-500 font-medium tracking-wide">{label}</div>
      <div className={`text-[26px] font-bold mt-1 tracking-tight ${critical ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
        {suffix && <span className="text-sm text-gray-500 font-medium ml-1">{suffix}</span>}
      </div>
      {delta && (
        <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${deltaColor} font-semibold`}>
          {delta}
        </div>
      )}
    </div>
  );
}
