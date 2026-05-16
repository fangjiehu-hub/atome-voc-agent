'use client';

import { useEffect, useState } from 'react';
import SeverityBadge from './SeverityBadge';
import CategoryTag from './CategoryTag';
import { CATEGORIES, SEVERITY_MAP } from '@/lib/constants';
import * as api from '@/lib/api';

interface DrilldownPost {
  id: number;
  platform: string;
  url: string | null;
  author_handle: string | null;
  severity: string | null;
  category: string | null;
  summary: string | null;
  content_text: string | null;
  engagement_likes: number;
  engagement_replies: number;
  engagement_reposts: number;
  created_at: string | null;
}

interface DrilldownData {
  date: string;
  total: number;
  by_category: { category: string; count: number; pct: number }[];
  by_severity: { severity: string; count: number; pct: number }[];
  by_platform: { platform: string; count: number }[];
  top_posts: DrilldownPost[];
}

interface DrilldownPanelProps {
  date: string;
  onClose: () => void;
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'none'];
const SEV_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#10B981',
  none: '#9CA3AF',
};

export default function DrilldownPanel({ date, onClose }: DrilldownPanelProps) {
  const [data, setData] = useState<DrilldownData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getDrilldown(date)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [date]);

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="mt-4 bg-gray-50 rounded-xl border border-gray-200 p-5 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-48 mb-3" />
        <div className="h-3 bg-gray-200 rounded w-64" />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="mt-4 bg-gray-50 rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">No posts found for {formattedDate}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">Close</button>
        </div>
      </div>
    );
  }

  // Sort severity by order
  const sortedSev = [...data.by_severity].sort(
    (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)
  );

  const maxCatCount = Math.max(...data.by_category.map((c) => c.count), 1);

  return (
    <div className="mt-4 bg-gradient-to-b from-brand-50/60 to-white rounded-xl border border-brand-300/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/70 border-b border-brand-100/60">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
            <span className="text-sm font-bold text-gray-900">
              Drill-down: {formattedDate}
            </span>
            <span className="bg-[#f0ff5f]/25 text-brand-500 px-2 py-0.5 rounded-full text-[11px] font-bold">
              {data.total} posts
            </span>
          </div>
          <div className="text-[11.5px] text-gray-500 mt-0.5 ml-6">
            What drove the volume on this day
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary row: severity pills + platform split */}
      <div className="px-5 py-3 flex items-center gap-6 border-b border-gray-100">
        {/* Severity breakdown — inline pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mr-1">Severity:</span>
          {sortedSev.map((s) => {
            const label = SEVERITY_MAP[s.severity as keyof typeof SEVERITY_MAP];
            return (
              <span
                key={s.severity}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: label?.bg || '#F3F4F6', color: label?.text || '#4B5563' }}
              >
                {s.count} {label?.label.split(' ')[0] || s.severity}
              </span>
            );
          })}
        </div>

        {/* Platform split */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mr-1">Source:</span>
          {data.by_platform.map((p) => (
            <span
              key={p.platform}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700"
            >
              {p.platform === 'twitter' ? 'X' : 'Reddit'}: {p.count}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] divide-x divide-gray-100">
        {/* Left: category breakdown */}
        <div className="p-4">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">
            Root causes (by category)
          </div>
          {data.by_category.map((cat) => {
            const label = CATEGORIES.find((c) => c.key === cat.category)?.label || cat.category;
            const catColor = CATEGORIES.find((c) => c.key === cat.category)?.color || '#9CA3AF';
            const pct = (cat.count / maxCatCount) * 100;
            return (
              <div key={cat.category} className="flex items-center gap-2 py-1">
                <div className="w-[90px] text-[11.5px] text-gray-700 truncate">{label}</div>
                <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${pct}%`, backgroundColor: catColor }}
                  />
                </div>
                <div className="text-[11.5px] font-semibold text-gray-800 w-6 text-right">
                  {cat.count}
                </div>
                <div className="text-[10px] text-gray-400 w-10 text-right">
                  {cat.pct}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: top posts */}
        <div className="p-4 max-h-[340px] overflow-y-auto">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">
            Top posts driving this spike (by severity + engagement)
          </div>
          <div className="flex flex-col gap-2">
            {data.top_posts.map((post) => (
              <div key={post.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex gap-2.5 items-start">
                {/* Left: severity + platform */}
                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                  {post.severity && <SeverityBadge severity={post.severity} />}
                  <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase">
                    {post.platform === 'twitter' ? 'X' : 'Reddit'}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-gray-800 leading-relaxed line-clamp-2 mb-1">
                    {post.summary || post.content_text?.slice(0, 180) || ''}
                  </p>
                  <div className="flex items-center gap-2.5 text-[10.5px] flex-wrap">
                    {post.category && <CategoryTag category={post.category} />}
                    {post.url ? (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-500 hover:text-coral font-medium"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        @{post.author_handle || 'source'}
                      </a>
                    ) : (
                      <span className="text-gray-500">@{post.author_handle || 'unknown'}</span>
                    )}
                    {post.engagement_likes > 0 && (
                      <span className="text-gray-400">
                        {post.engagement_likes} {post.platform === 'twitter' ? 'likes' : 'upvotes'}
                      </span>
                    )}
                    {post.engagement_replies > 0 && (
                      <span className="text-gray-400">
                        {post.engagement_replies} {post.platform === 'twitter' ? 'replies' : 'comments'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
