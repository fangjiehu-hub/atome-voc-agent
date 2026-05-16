'use client';

import { useEffect, useState } from 'react';
import RoutingMatrix from '@/components/RoutingMatrix';
import * as api from '@/lib/api';

interface RoutingRule {
  id: number;
  category: string;
  severity_min: string;
  primary_owner: string;
  departments: string[];
  escalate_to: string[] | null;
  channels: string[];
  is_active: boolean;
}

// Fallback routing rules for when API is unavailable
const DEFAULT_RULES: RoutingRule[] = [
  { id: 1, category: 'debt_collection', severity_min: 'low', primary_owner: 'Collections', departments: ['Compliance'], escalate_to: ['CEO Office'], channels: ['slack', 'lark'], is_active: true },
  { id: 2, category: 'transaction', severity_min: 'low', primary_owner: 'Product', departments: ['CS', 'Ops'], escalate_to: null, channels: ['slack'], is_active: true },
  { id: 3, category: 'app_bug', severity_min: 'low', primary_owner: 'Engineering', departments: ['Product'], escalate_to: null, channels: ['slack'], is_active: true },
  { id: 4, category: 'interest_rate', severity_min: 'low', primary_owner: 'Compliance', departments: ['CEO Office', 'PR'], escalate_to: ['CEO Office'], channels: ['slack', 'email'], is_active: true },
  { id: 5, category: 'fraud', severity_min: 'medium', primary_owner: 'Risk', departments: ['Security'], escalate_to: ['CEO Office'], channels: ['slack', 'lark', 'email'], is_active: true },
  { id: 6, category: 'security', severity_min: 'medium', primary_owner: 'Security', departments: ['Risk'], escalate_to: ['CEO Office'], channels: ['slack', 'lark', 'email'], is_active: true },
  { id: 7, category: 'customer_service', severity_min: 'low', primary_owner: 'CS Head', departments: ['CS Ops'], escalate_to: null, channels: ['slack'], is_active: true },
  { id: 8, category: 'refund', severity_min: 'low', primary_owner: 'CS', departments: ['Product'], escalate_to: null, channels: ['slack'], is_active: true },
  { id: 9, category: 'spend_limit', severity_min: 'low', primary_owner: 'Product', departments: ['Risk'], escalate_to: null, channels: ['slack'], is_active: true },
  { id: 10, category: 'account', severity_min: 'low', primary_owner: 'CS', departments: ['Product'], escalate_to: null, channels: ['slack'], is_active: true },
];

export default function RoutingPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);

  useEffect(() => {
    api.getRoutingRules()
      .then((data) => setRules(data.items || []))
      .catch(() => setRules(DEFAULT_RULES));
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Routing Matrix</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Category-to-department alert routing configuration
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
        <RoutingMatrix rules={rules} />
      </div>

      {/* SLA table */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5 mt-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3.5">Alert SLA by Severity</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Severity', 'Cadence', 'Channel', 'SLA'].map((h) => (
                <th key={h} className="text-left text-[11px] uppercase tracking-wider text-gray-500 font-semibold px-2.5 py-2 border-b border-gray-200 bg-gray-50">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-2.5 py-2.5 border-b border-gray-100"><span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-[11px] font-bold">CRITICAL / HIGH</span></td>
              <td className="px-2.5 py-2.5 border-b border-gray-100 font-semibold">Immediate push</td>
              <td className="px-2.5 py-2.5 border-b border-gray-100">Slack DM + Lark DM + Email</td>
              <td className="px-2.5 py-2.5 border-b border-gray-100">&lt; 15 min</td>
            </tr>
            <tr>
              <td className="px-2.5 py-2.5 border-b border-gray-100"><span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[11px] font-bold">MEDIUM</span></td>
              <td className="px-2.5 py-2.5 border-b border-gray-100 font-semibold">Queue for review</td>
              <td className="px-2.5 py-2.5 border-b border-gray-100">Team channel, no DM</td>
              <td className="px-2.5 py-2.5 border-b border-gray-100">Within 4h</td>
            </tr>
            <tr>
              <td className="px-2.5 py-2.5"><span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[11px] font-bold">LOW / NONE</span></td>
              <td className="px-2.5 py-2.5 font-semibold">Daily digest</td>
              <td className="px-2.5 py-2.5">Aggregated morning brief</td>
              <td className="px-2.5 py-2.5">Next digest</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
