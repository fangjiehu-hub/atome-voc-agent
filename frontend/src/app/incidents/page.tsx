'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import IncidentTable from '@/components/IncidentTable';
import type { Incident } from '@/lib/types';
import * as api from '@/lib/api';
import { SEVERITY_MAP, STATUS_MAP } from '@/lib/constants';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIncidents({ severity: filterSeverity, status: filterStatus, page, page_size: 20 })
      .then((data) => {
        setIncidents(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        // Demo data
        setIncidents([
          {
            id: 1, incident_code: 'INC-2026-0419-04', title: 'Viral X thread accuses Atome PH of predatory rates',
            summary: 'Thread by PH finance influencer alleges APR misrepresentation.', category: 'interest_rate',
            severity: 'critical', platforms: ['twitter'], post_count: 1, first_seen: '2026-04-19T14:00:00Z',
            last_seen: '2026-04-19T17:00:00Z', trend_pct: 180, status: 'new', assigned_to: null,
            assigned_dept: 'CEO Office', created_at: '2026-04-19T14:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://x.com/PisoWisePH/status/1234567890', source_created_at: '2026-04-19T14:00:00Z', source_author: 'PisoWisePH',
          },
          {
            id: 2, incident_code: 'INC-2026-0419-03', title: 'GCash repayment failing — r/Philippines thread',
            summary: '184 comments. Users unable to complete repayment through GCash.', category: 'transaction',
            severity: 'critical', platforms: ['reddit'], post_count: 184, first_seen: '2026-04-19T11:00:00Z',
            last_seen: '2026-04-19T17:00:00Z', trend_pct: 220, status: 'in_review', assigned_to: null,
            assigned_dept: 'Product + CS', created_at: '2026-04-19T11:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://reddit.com/r/Philippines/comments/abc123/', source_created_at: '2026-04-19T11:00:00Z', source_author: 'user123',
          },
          {
            id: 3, incident_code: 'INC-2026-0419-02', title: 'App checkout crash after v3.8.2',
            summary: '21 tweets + 2 Reddit posts reporting checkout crash.', category: 'app_bug',
            severity: 'high', platforms: ['twitter', 'reddit'], post_count: 23, first_seen: '2026-04-19T08:00:00Z',
            last_seen: '2026-04-19T17:00:00Z', trend_pct: 130, status: 'acknowledged', assigned_to: null,
            assigned_dept: 'Engineering', created_at: '2026-04-19T08:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://x.com/user456/status/9876543210', source_created_at: '2026-04-19T08:00:00Z', source_author: 'user456',
          },
        ]);
        setTotal(3);
      });
  }, [page, filterSeverity, filterStatus]);

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Incidents</h1>
          <p className="text-[13px] text-gray-500 mt-1">{total} incidents total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] bg-white"
          value={filterSeverity || ''}
          onChange={(e) => setFilterSeverity(e.target.value || null)}
        >
          <option value="">All severities</option>
          {Object.entries(SEVERITY_MAP).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] bg-white"
          value={filterStatus || ''}
          onChange={(e) => setFilterStatus(e.target.value || null)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_MAP).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
        <IncidentTable incidents={incidents} />
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-600">
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
