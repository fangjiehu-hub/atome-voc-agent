'use client';

import { useState } from 'react';
import type { Incident, Post } from '@/lib/types';
import SeverityBadge from './SeverityBadge';
import CategoryTag from './CategoryTag';
import * as api from '@/lib/api';

interface IncidentCardProps {
  incident: Incident;
}

export default function IncidentCard({ incident }: IncidentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const borderColor = {
    critical: 'border-l-red-600',
    high: 'border-l-orange-500',
    medium: 'border-l-amber-500',
    low: 'border-l-emerald-500',
    none: 'border-l-gray-400',
  }[incident.severity] || 'border-l-gray-400';

  const timeAgo = incident.last_seen
    ? formatTimeAgo(new Date(incident.last_seen))
    : '';

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (posts.length === 0) {
      setLoading(true);
      try {
        const data = await api.getIncident(incident.id);
        setPosts(data.posts || []);
      } catch {
        setPosts([]);
      }
      setLoading(false);
    }
    setExpanded(true);
  };

  return (
    <div className={`bg-white rounded-[14px] border border-gray-200 shadow-sm border-l-[3px] ${borderColor} flex flex-col`}>
      {/* Card header */}
      <div className="p-3.5 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <SeverityBadge severity={incident.severity} />
          <span className="ml-auto text-[11px] text-gray-500">{timeAgo}</span>
        </div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1.5 leading-snug">{incident.title}</h4>
        <p className="text-[12.5px] text-gray-600 leading-relaxed mb-2.5 line-clamp-2">
          {incident.summary}
        </p>

        <div className="flex items-center gap-2 text-[11.5px] text-gray-500 flex-wrap mt-auto">
          {incident.platforms?.map((p) => (
            <span key={p} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[11px] font-medium">
              {p === 'twitter' ? 'X' : 'Reddit'}
            </span>
          ))}
          {incident.category && <CategoryTag category={incident.category} />}
          <span>{incident.post_count} posts</span>
        </div>
      </div>

      {/* Expand/collapse button */}
      <button
        onClick={handleExpand}
        className="flex items-center justify-center gap-1.5 py-2 border-t border-gray-100 text-[11.5px] text-gray-500 hover:text-brand-500 hover:bg-gray-50 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {expanded ? 'Hide posts' : `View all ${incident.post_count} posts`}
      </button>

      {/* Expanded post list */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-3.5 py-2.5 rounded-b-[14px] max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-400 text-xs py-4">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-4">No posts found</div>
          ) : (
            <div className="flex flex-col gap-2">
              {posts.map((post, i) => (
                <div key={post.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                  {/* Post header: author + severity + timestamp */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase">
                      {post.platform === 'twitter' ? 'X' : 'Reddit'}
                    </span>
                    {post.severity && <SeverityBadge severity={post.severity} />}
                    <span className="ml-auto text-[10.5px] text-gray-400">
                      {post.created_at
                        ? new Date(post.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>

                  {/* Summary or content preview */}
                  <p className="text-[12px] text-gray-700 leading-relaxed mb-2 line-clamp-2">
                    {post.summary || post.content_text?.slice(0, 150) || ''}
                  </p>

                  {/* Author + source link */}
                  <div className="flex items-center gap-2">
                    {post.url ? (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-brand-500 hover:text-coral font-medium"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        @{post.author_handle || 'source'}
                      </a>
                    ) : (
                      <span className="text-[11px] text-gray-500">@{post.author_handle || 'unknown'}</span>
                    )}
                    {post.engagement_likes > 0 && (
                      <span className="text-[10.5px] text-gray-400 ml-auto">
                        {post.engagement_likes} {post.platform === 'twitter' ? 'likes' : 'upvotes'}
                      </span>
                    )}
                    {post.engagement_replies > 0 && (
                      <span className="text-[10.5px] text-gray-400">
                        {post.engagement_replies} {post.platform === 'twitter' ? 'replies' : 'comments'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
