import type { Alert } from '@/lib/types';
import SeverityBadge from './SeverityBadge';
import { CADENCE_MAP } from '@/lib/constants';

interface AlertFeedItemProps {
  alert: Alert;
}

export default function AlertFeedItem({ alert }: AlertFeedItemProps) {
  const cadence = CADENCE_MAP[alert.alert_type as keyof typeof CADENCE_MAP] || CADENCE_MAP.digest;
  const channelIcon = {
    slack: { bg: 'bg-[#4A154B]', label: 'S' },
    lark: { bg: 'bg-[#00D6B9]', label: 'L' },
    email: { bg: 'bg-gray-200', label: '@' },
  }[alert.channel] || { bg: 'bg-gray-200', label: '?' };

  const isNew = !alert.acknowledged_at;

  return (
    <div
      className={`flex gap-3 p-3.5 rounded-[10px] border transition-all ${
        isNew
          ? 'border-l-[3px] border-l-brand-500 border-gray-200 bg-gradient-to-r from-brand-50/60 to-white'
          : 'border-gray-200 bg-white'
      } hover:border-brand-300 hover:shadow-sm`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-extrabold text-white ${channelIcon.bg}`}
      >
        {channelIcon.label}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <SeverityBadge severity={alert.severity} />
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[10px]"
            style={{ backgroundColor: cadence.bg, color: cadence.text }}
          >
            {cadence.label}
          </span>
          <span className="ml-auto text-[11px] text-gray-500">
            {alert.created_at ? new Date(alert.created_at).toLocaleString() : ''}
          </span>
        </div>
        <div className="text-[13px] font-semibold text-gray-900 mb-0.5">{alert.subject}</div>
        <div className="text-xs text-gray-600 leading-relaxed line-clamp-2">{alert.body}</div>
        {alert.source_url && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
            <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
            </svg>
            <a href={alert.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:text-coral hover:underline">
              @{alert.source_author || 'source'}
            </a>
            {alert.source_created_at && (
              <span className="text-gray-400">
                {new Date(alert.source_created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
        {alert.recipients && alert.recipients.length > 0 && (
          <div className="mt-1.5 text-[11px] text-gray-500">
            Routed to: <span className="text-brand-500 font-semibold">{alert.recipients.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
