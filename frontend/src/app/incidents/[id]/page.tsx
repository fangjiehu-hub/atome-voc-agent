'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import SeverityBadge from '@/components/SeverityBadge';
import CategoryTag from '@/components/CategoryTag';
import SubIssueTag from '@/components/SubIssueTag';
import { STATUS_MAP } from '@/lib/constants';
import type { Incident, Post } from '@/lib/types';
import * as api from '@/lib/api';

export default function IncidentDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    api
      .getIncident(id)
      .then((data) => {
        setIncident(data.incident);
        setPosts(data.posts || []);
      })
      .catch(() => {});
  }, [id]);

  if (!incident) {
    return <div className="text-gray-500 py-12 text-center">Loading incident...</div>;
  }

  const status = STATUS_MAP[incident.status as keyof typeof STATUS_MAP] || STATUS_MAP.new;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <SeverityBadge severity={incident.severity} />
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: status.bg, color: status.text }}
          >
            {status.label}
          </span>
          <span className="text-[13px] text-gray-500">{incident.incident_code}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">{incident.title}</h1>
        <p className="text-[13px] text-gray-600 mt-2">{incident.summary}</p>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-[14px] border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Category</div>
          {incident.category && <CategoryTag category={incident.category} />}
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Post Count</div>
          <div className="text-lg font-bold text-gray-900">{incident.post_count}</div>
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Assigned</div>
          <div className="text-sm font-semibold text-gray-900">{incident.assigned_dept || 'Unassigned'}</div>
        </div>
        <div className="bg-white rounded-[14px] border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Platforms</div>
          <div className="flex gap-1.5">
            {incident.platforms?.map((p) => (
              <span key={p} className="bg-gray-100 px-2 py-0.5 rounded-full text-[11px] font-medium text-gray-700">
                {p === 'twitter' ? 'X' : 'Reddit'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Related Posts ({posts.length})</h3>
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="border border-gray-100 rounded-lg p-3.5">
              <div className="flex items-center gap-2 mb-2">
                {post.severity && <SeverityBadge severity={post.severity} />}
                {post.category && <CategoryTag category={post.category} />}
                <span className="text-[11px] text-gray-500 ml-auto">
                  {post.platform === 'twitter' ? 'X' : 'Reddit'} &middot; @{post.author_handle}
                </span>
              </div>
              <p className="text-[13px] text-gray-800 leading-relaxed mb-2">{post.content_text}</p>
              {post.sub_issues && post.sub_issues.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {post.sub_issues.map((tag) => (
                    <SubIssueTag key={tag} tag={tag} />
                  ))}
                </div>
              )}
              {post.summary && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-2">
                  <span className="font-semibold text-brand-500">AI Summary:</span> {post.summary}
                </div>
              )}
              <div className="flex gap-3 mt-2 text-[11px] text-gray-500">
                <span>Language: {post.language || 'en'}</span>
                <span>Likes: {post.engagement_likes}</span>
                <span>Replies: {post.engagement_replies}</span>
                {post.url && (
                  <a href={post.url} target="_blank" rel="noopener" className="text-brand-500 hover:text-coral hover:underline ml-auto">
                    View source
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
