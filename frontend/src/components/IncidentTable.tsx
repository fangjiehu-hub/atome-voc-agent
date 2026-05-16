'use client';

import { useState } from 'react';
import type { Incident, Post } from '@/lib/types';
import SeverityBadge from './SeverityBadge';
import CategoryTag from './CategoryTag';
import { STATUS_MAP } from '@/lib/constants';
import * as api from '@/lib/api';

interface IncidentTableProps {
  incidents: Incident[];
}

export default function IncidentTable({ incidents }: IncidentTableProps) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {['Sev', 'Incident', 'Source', 'Category', 'Channel', 'Posts', '24h Change', 'Status', ''].map((h) => (
            <th
              key={h}
              className="text-left text-[11px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {incidents.map((inc) => (
          <ExpandableRow key={inc.id} incident={inc} />
        ))}
      </tbody>
    </table>
  );
}

function ExpandableRow({ incident: inc }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const status = STATUS_MAP[inc.status as keyof typeof STATUS_MAP] || STATUS_MAP.new;

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (posts.length === 0) {
      setLoading(true);
      try {
        const data = await api.getIncident(inc.id);
        setPosts(data.posts || []);
      } catch {
        setPosts([]);
      }
      setLoading(false);
    }
    setExpanded(true);
  };

  const borderLeft = {
    critical: 'border-l-[3px] border-l-red-600',
    high: 'border-l-[3px] border-l-orange-500',
    medium: 'border-l-[3px] border-l-amber-500',
    low: 'border-l-[3px] border-l-emerald-500',
    none: '',
  }[inc.severity] || '';

  return (
    <>
      <tr className={`hover:bg-gray-50 group cursor-pointer ${borderLeft}`} onClick={handleExpand}>
        <td className="px-2.5 py-3 border-b border-gray-100">
          <SeverityBadge severity={inc.severity} />
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100">
          <div className="font-semibold text-gray-900">{inc.title}</div>
          <div className="text-[11.5px] text-gray-500 mt-0.5">
            {inc.summary && (
              <span className="text-gray-600 line-clamp-1">{inc.summary}</span>
            )}
          </div>
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100 max-w-[180px]">
          {inc.source_url ? (
            <div>
              <a
                href={inc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-500 hover:text-coral hover:underline text-[11.5px] truncate block"
                onClick={(e) => e.stopPropagation()}
              >
                @{inc.source_author || 'link'}
              </a>
              {inc.source_created_at && (
                <div className="text-[10.5px] text-gray-400">
                  {new Date(inc.source_created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-[11px]">-</span>
          )}
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100">
          {inc.category && <CategoryTag category={inc.category} />}
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100">
          {inc.platforms?.map((p) => (
            <span key={p} className="mr-1">
              {p === 'twitter' ? 'X' : 'Reddit'}
            </span>
          ))}
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100 font-semibold">
          {inc.post_count}
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100">
          {inc.trend_pct != null && inc.trend_pct > 0 && (
            <span className="text-red-600 font-semibold text-[11.5px]">
              ▲ {inc.trend_pct.toFixed(0)}%
            </span>
          )}
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ backgroundColor: status.bg, color: status.text }}
          >
            {status.label}
          </span>
        </td>
        <td className="px-2.5 py-3 border-b border-gray-100 w-8">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>

      {/* Expanded post list */}
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-gray-50/80 px-4 py-3 border-b border-gray-200">
            {loading ? (
              <div className="text-center text-gray-400 text-xs py-4">Loading posts...</div>
            ) : posts.length === 0 ? (
              <div className="text-center text-gray-400 text-xs py-4">No posts found</div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
                  All {posts.length} posts in this incident — ranked by severity
                </div>
                {posts.map((post) => (
                  <div key={post.id} className="bg-white rounded-lg border border-gray-200 px-3.5 py-2.5 flex gap-3 items-start">
                    {/* Left: severity + platform */}
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      {post.severity && <SeverityBadge severity={post.severity} />}
                      <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase">
                        {post.platform === 'twitter' ? 'X' : 'Reddit'}
                      </span>
                    </div>

                    {/* Center: content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-gray-800 leading-relaxed line-clamp-2 mb-1.5">
                        {post.summary || post.content_text?.slice(0, 200) || ''}
                      </p>
                      <div className="flex items-center gap-3 text-[11px]">
                        {post.url ? (
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-500 hover:text-coral font-medium"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            @{post.author_handle || 'source'}
                          </a>
                        ) : (
                          <span className="text-gray-500">@{post.author_handle || 'unknown'}</span>
                        )}
                        <span className="text-gray-400">
                          {post.created_at
                            ? new Date(post.created_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : ''}
                        </span>
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
            )}
          </td>
        </tr>
      )}
    </>
  );
}
