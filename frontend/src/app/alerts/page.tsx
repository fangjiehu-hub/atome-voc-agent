'use client';

import { useEffect, useState } from 'react';
import AlertFeedItem from '@/components/AlertFeedItem';
import type { Alert } from '@/lib/types';
import * as api from '@/lib/api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api
      .getAlerts({ page_size: 50 })
      .then((data) => {
        setAlerts(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        // Demo data
        setAlerts([
          {
            id: 1, incident_id: 1, post_id: null, alert_type: 'immediate', severity: 'critical',
            channel: 'slack', recipients: ['CEO Office', 'Compliance', 'PR'],
            subject: '[CRITICAL] Viral X thread accuses Atome PH of predatory rates',
            body: 'Thread by PH finance influencer @PisoWisePH alleges APR misrepresentation.',
            delivery_status: 'sent', acknowledged_at: null, sent_at: '2026-04-19T14:05:00Z',
            created_at: '2026-04-19T14:01:00Z',
            source_url: 'https://x.com/PisoWisePH/status/1234567890', source_created_at: '2026-04-19T14:00:00Z', source_author: 'PisoWisePH',
          },
          {
            id: 2, incident_id: 2, post_id: null, alert_type: 'immediate', severity: 'critical',
            channel: 'lark', recipients: ['Product', 'CS', 'Ops'],
            subject: '[CRITICAL] GCash repayment failing — r/Philippines thread',
            body: '184 comments. Users unable to complete repayment through GCash integration.',
            delivery_status: 'sent', acknowledged_at: '2026-04-19T11:30:00Z', sent_at: '2026-04-19T11:05:00Z',
            created_at: '2026-04-19T11:01:00Z',
            source_url: 'https://reddit.com/r/Philippines/comments/abc123/', source_created_at: '2026-04-19T11:00:00Z', source_author: 'user123',
          },
          {
            id: 3, incident_id: 3, post_id: null, alert_type: 'queue', severity: 'high',
            channel: 'slack', recipients: ['Product', 'Engineering'],
            subject: '[HIGH] App checkout crash after v3.8.2 — Android users',
            body: '23 posts reporting checkout crash on Android after 17 Apr release.',
            delivery_status: 'sent', acknowledged_at: null, sent_at: '2026-04-19T08:15:00Z',
            created_at: '2026-04-19T08:10:00Z',
            source_url: 'https://x.com/user456/status/9876543210', source_created_at: '2026-04-19T08:00:00Z', source_author: 'user456',
          },
          {
            id: 4, incident_id: null, post_id: null, alert_type: 'digest', severity: 'low',
            channel: 'email', recipients: ['All stakeholders'],
            subject: 'Atome VoC Daily Digest - 2026-04-19',
            body: 'Daily VoC Digest - 14 incidents in last 24h.',
            delivery_status: 'sent', acknowledged_at: null, sent_at: '2026-04-19T09:00:00Z',
            created_at: '2026-04-19T09:00:00Z',
            source_url: null, source_created_at: null, source_author: null,
          },
        ]);
        setTotal(4);
      });
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Alert Feed</h1>
          <p className="text-[13px] text-gray-500 mt-1">{total} alerts</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 max-h-[720px] overflow-y-auto pr-1">
        {alerts.map((alert) => (
          <AlertFeedItem key={alert.id} alert={alert} />
        ))}
        {alerts.length === 0 && (
          <div className="text-center text-gray-400 py-12">No alerts yet</div>
        )}
      </div>
    </div>
  );
}
