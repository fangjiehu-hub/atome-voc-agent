'use client';

import { useEffect, useState } from 'react';
import KPICard from '@/components/KPICard';
import TrendChart from '@/components/TrendChart';
import DrilldownPanel from '@/components/DrilldownPanel';
import SeverityDonut from '@/components/SeverityDonut';
import IncidentTable from '@/components/IncidentTable';
import DateRangeSelector from '@/components/DateRangeSelector';
import { CATEGORIES, SUBREDDITS } from '@/lib/constants';
import type { Incident, KPIOverview, TrendPoint, CategoryCount, SeverityCount, TimeRange } from '@/lib/types';
import * as api from '@/lib/api';

function rangeLabel(range: TimeRange): string {
  if (range.mode === 'custom') return `${range.since} – ${range.until}`;
  return `${range.days}d`;
}

export default function OverviewPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>({ mode: 'preset', days: 7 });
  const [kpi, setKpi] = useState<KPIOverview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [severity, setSeverity] = useState<{ items: SeverityCount[]; total: number } | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSelectedDate(null);
    const incidentDays = timeRange.mode === 'preset' ? timeRange.days : undefined;
    Promise.all([
      api.getOverview(timeRange),
      api.getTrend(timeRange),
      api.getCategories(timeRange),
      api.getSeverityDistribution(timeRange),
      api.getIncidents({ page_size: 6, days: incidentDays }),
      api.getChannels(timeRange),
    ])
      .then(([kpiData, trendData, catData, sevData, incData, channelData]) => {
        setKpi(kpiData);
        setTrend(trendData.points || []);
        setCategories(catData.items || []);
        setSeverity(sevData);
        setIncidents(incData.items || []);
        setChannels(channelData.items || []);
      })
      .catch(() => {
        // Use static demo data when API is unavailable
        setKpi({
          total_mentions: 842,
          negative_complaints: 278,
          negative_pct: 33.0,
          critical_incidents: 4,
          open_incidents: 14,
          avg_detect_to_alert_min: 11,
          prev_total_mentions: 768,
          prev_negative_pct: 27.8,
          prev_critical_incidents: 2,
          prev_open_incidents: 10,
          prev_avg_detect_to_alert_min: 14,
        });
        setTrend([
          { date: '2026-04-13', total: 32, critical: 2, high: 5, medium: 10, low: 10, none: 5 },
          { date: '2026-04-14', total: 35, critical: 3, high: 6, medium: 11, low: 10, none: 5 },
          { date: '2026-04-15', total: 38, critical: 4, high: 7, medium: 12, low: 10, none: 5 },
          { date: '2026-04-16', total: 42, critical: 5, high: 8, medium: 13, low: 11, none: 5 },
          { date: '2026-04-17', total: 50, critical: 7, high: 10, medium: 15, low: 12, none: 6 },
          { date: '2026-04-18', total: 58, critical: 9, high: 12, medium: 17, low: 13, none: 7 },
          { date: '2026-04-19', total: 65, critical: 12, high: 14, medium: 18, low: 14, none: 7 },
        ]);
        setCategories([
          { category: 'transaction', count: 58, pct: 20.9 },
          { category: 'interest_rate', count: 44, pct: 15.8 },
          { category: 'app_bug', count: 35, pct: 12.6 },
          { category: 'customer_service', count: 30, pct: 10.8 },
          { category: 'debt_collection', count: 22, pct: 7.9 },
          { category: 'spend_limit', count: 18, pct: 6.5 },
          { category: 'fraud', count: 9, pct: 3.2 },
          { category: 'refund', count: 26, pct: 9.4 },
          { category: 'account', count: 15, pct: 5.4 },
          { category: 'security', count: 12, pct: 4.3 },
          { category: 'not_negative', count: 9, pct: 3.2 },
        ]);
        setSeverity({
          items: [
            { severity: 'critical', count: 2, pct: 14 },
            { severity: 'high', count: 4, pct: 29 },
            { severity: 'medium', count: 5, pct: 36 },
            { severity: 'low', count: 2, pct: 14 },
            { severity: 'none', count: 1, pct: 7 },
          ],
          total: 14,
        });
        setChannels([
          { platform: 'twitter', total: 523, negative: 303, top_keywords: null, top_subreddits: null },
          { platform: 'reddit', total: 319, negative: 131, top_keywords: null, top_subreddits: null },
        ]);
        setIncidents([
          {
            id: 1, incident_code: 'INC-2026-0419-04', title: 'Viral X thread accuses Atome PH of predatory rates',
            summary: 'Thread by PH finance influencer @PisoWisePH (112K followers) alleges effective APR misrepresentation, citing 3 user screenshots.',
            category: 'interest_rate', severity: 'critical', platforms: ['twitter'], post_count: 1,
            first_seen: '2026-04-19T14:00:00Z', last_seen: '2026-04-19T17:00:00Z', trend_pct: 180,
            status: 'new', assigned_to: null, assigned_dept: 'CEO Office', created_at: '2026-04-19T14:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://x.com/PisoWisePH/status/1234567890', source_created_at: '2026-04-19T14:00:00Z', source_author: 'PisoWisePH',
          },
          {
            id: 2, incident_code: 'INC-2026-0419-03', title: 'GCash repayment failing — r/Philippines thread blowing up',
            summary: 'Thread with 184 comments on r/Philippines. Users unable to complete repayment through GCash integration.',
            category: 'transaction', severity: 'critical', platforms: ['reddit'], post_count: 184,
            first_seen: '2026-04-19T11:00:00Z', last_seen: '2026-04-19T17:00:00Z', trend_pct: 220,
            status: 'in_review', assigned_to: null, assigned_dept: 'Product + CS', created_at: '2026-04-19T11:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://reddit.com/r/Philippines/comments/abc123/gcash_repayment/', source_created_at: '2026-04-19T11:00:00Z', source_author: 'user123',
          },
          {
            id: 3, incident_code: 'INC-2026-0419-02', title: 'App checkout crash after v3.8.2 — Android users',
            summary: '21 tweets + 2 Reddit posts on r/phinvest reporting checkout crash on Android after the 17 Apr release.',
            category: 'app_bug', severity: 'high', platforms: ['twitter', 'reddit'], post_count: 23,
            first_seen: '2026-04-19T08:00:00Z', last_seen: '2026-04-19T17:00:00Z', trend_pct: 130,
            status: 'acknowledged', assigned_to: null, assigned_dept: 'Product + Engineering', created_at: '2026-04-19T08:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://x.com/user456/status/9876543210', source_created_at: '2026-04-19T08:00:00Z', source_author: 'user456',
          },
          {
            id: 4, incident_code: 'INC-2026-0419-01', title: 'Collection SMS tone complaints from PH borrowers',
            summary: '14 tweets quoting aggressive collection SMS messages. Several users screenshot messages that allegedly threaten "legal action in 24 hours."',
            category: 'debt_collection', severity: 'high', platforms: ['twitter'], post_count: 14,
            first_seen: '2026-04-19T03:00:00Z', last_seen: '2026-04-19T17:00:00Z', trend_pct: null,
            status: 'new', assigned_to: null, assigned_dept: 'Collections + Compliance', created_at: '2026-04-19T03:00:00Z', updated_at: '2026-04-19T17:00:00Z',
            source_url: 'https://x.com/user789/status/1122334455', source_created_at: '2026-04-19T03:00:00Z', source_author: 'user789',
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, [timeRange]);

  const maxCatCount = Math.max(...categories.map((c) => c.count), 1);

  // Compute real deltas from previous period
  const mentionsDelta = (() => {
    if (!kpi) return { text: '', dir: 'neutral' as const };
    const prev = kpi.prev_total_mentions;
    if (prev === 0) return { text: kpi.total_mentions > 0 ? 'New data' : 'No data', dir: 'neutral' as const };
    const pct = ((kpi.total_mentions - prev) / prev * 100).toFixed(1);
    const num = Number(pct);
    if (num > 0) return { text: `+${pct}% vs prev ${rangeLabel(timeRange)}`, dir: 'up' as const };
    if (num < 0) return { text: `${pct}% vs prev ${rangeLabel(timeRange)}`, dir: 'down' as const };
    return { text: `No change vs prev ${rangeLabel(timeRange)}`, dir: 'neutral' as const };
  })();

  const negPctDelta = (() => {
    if (!kpi) return { text: '', dir: 'neutral' as const };
    const diff = +(kpi.negative_pct - kpi.prev_negative_pct).toFixed(1);
    if (diff > 0) return { text: `+${diff} pts vs prev period`, dir: 'up' as const };
    if (diff < 0) return { text: `${diff} pts vs prev period`, dir: 'down' as const };
    return { text: 'No change vs prev period', dir: 'neutral' as const };
  })();

  const criticalDelta = (() => {
    if (!kpi) return { text: '', dir: 'neutral' as const };
    const diff = kpi.critical_incidents - kpi.prev_critical_incidents;
    if (diff > 0) return { text: `+${diff} vs prev period`, dir: 'up' as const };
    if (diff < 0) return { text: `${diff} vs prev period`, dir: 'down' as const };
    return { text: 'No change vs prev period', dir: 'neutral' as const };
  })();

  const latencyDelta = (() => {
    if (!kpi) return { text: '', dir: 'neutral' as const };
    const cur = kpi.avg_detect_to_alert_min;
    const prev = kpi.prev_avg_detect_to_alert_min;
    if (cur == null || prev == null) return { text: '', dir: 'neutral' as const };
    const diff = +(cur - prev).toFixed(1);
    if (diff > 0) return { text: `+${diff} min vs prev`, dir: 'up' as const };
    if (diff < 0) return { text: `${diff} min vs prev`, dir: 'down' as const };
    return { text: 'No change vs prev', dir: 'neutral' as const };
  })();

  const openIncDelta = (() => {
    if (!kpi) return { text: '', dir: 'neutral' as const };
    const diff = kpi.open_incidents - kpi.prev_open_incidents;
    if (diff > 0) return { text: `+${diff} vs prev period`, dir: 'up' as const };
    if (diff < 0) return { text: `${diff} vs prev period`, dir: 'down' as const };
    return { text: 'No change vs prev period', dir: 'neutral' as const };
  })();

  return (
    <div>
      {/* Page header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
            Executive Overview &middot; Philippines
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Monitoring X / Twitter and Reddit for Atome PH
          </p>
        </div>
        <DateRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3.5 mb-5">
        <KPICard
          label="Total mentions"
          value={kpi?.total_mentions ?? '-'}
          delta={mentionsDelta.text}
          deltaDirection={mentionsDelta.dir}
        />
        <KPICard
          label="Negative complaints"
          value={kpi?.negative_complaints ?? '-'}
          suffix={kpi ? `(${kpi.negative_pct}%)` : ''}
          delta={negPctDelta.text}
          deltaDirection={negPctDelta.dir}
        />
        <KPICard
          label="Critical incidents (S3+S4)"
          value={kpi?.critical_incidents ?? '-'}
          delta={criticalDelta.text}
          deltaDirection={criticalDelta.dir}
          critical
        />
        <KPICard
          label="Detect-to-alert latency"
          value={kpi?.avg_detect_to_alert_min ?? '-'}
          suffix={kpi?.avg_detect_to_alert_min ? 'min' : ''}
          delta={latencyDelta.text}
          deltaDirection={latencyDelta.dir}
        />
        <KPICard
          label="Open incidents"
          value={kpi?.open_incidents ?? '-'}
          delta={openIncDelta.text}
          deltaDirection={openIncDelta.dir}
        />
      </div>

      {/* Trend + Severity donut */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3.5">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Complaint volume by severity</h3>
              <div className="text-xs text-gray-500 mt-0.5">Last {rangeLabel(timeRange)}</div>
            </div>
          </div>
          <TrendChart
            data={trend}
            selectedDate={selectedDate}
            onDateClick={(date) => setSelectedDate(selectedDate === date ? null : date)}
          />
          {selectedDate && (
            <DrilldownPanel
              date={selectedDate}
              onClose={() => setSelectedDate(null)}
            />
          )}
        </div>

        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <div className="mb-3.5">
            <h3 className="text-sm font-bold text-gray-900">Severity distribution</h3>
            <div className="text-xs text-gray-500 mt-0.5">All mentions · last {rangeLabel(timeRange)}</div>
          </div>
          {severity && <SeverityDonut data={severity.items} total={severity.total} />}
        </div>
      </div>

      {/* Categories + Channel breakdown */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Categories bar chart */}
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3.5">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Top complaint categories</h3>
              <div className="text-xs text-gray-500 mt-0.5">Volume last {rangeLabel(timeRange)}</div>
            </div>
          </div>
          {categories.map((cat) => {
            const label =
              CATEGORIES.find((c) => c.key === cat.category)?.label || cat.category;
            const pct = (cat.count / maxCatCount) * 100;
            return (
              <div key={cat.category} className="grid grid-cols-[150px_1fr_50px] items-center gap-2.5 py-1.5 text-[13px]">
                <div className="text-gray-700 truncate">{label}</div>
                <div className="bg-gray-100 rounded h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded bg-gradient-to-r from-brand-500 to-brand-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-right font-semibold text-gray-800 text-[12.5px]">
                  {cat.count}
                </div>
              </div>
            );
          })}
        </div>

        {/* Channel breakdown */}
        <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between mb-3.5">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Channel breakdown</h3>
              <div className="text-xs text-gray-500 mt-0.5">X / Twitter vs Reddit</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {/* X / Twitter */}
            {(() => {
              const tw = channels.find((c) => c.platform === 'twitter');
              const twTotal = tw?.total ?? 0;
              const twNeg = tw?.negative ?? 0;
              const twNegPct = twTotal > 0 ? Math.round((twNeg / twTotal) * 100) : 0;
              return (
                <div className="border border-gray-200 rounded-[10px] p-3.5 bg-gray-50">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center font-extrabold text-sm">
                      X
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">X / Twitter</div>
                      <div className="text-[11px] text-gray-500">Realtime signal</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white rounded-lg p-2 border border-gray-200">
                      <div className="text-lg font-bold text-gray-900">{twTotal}</div>
                      <div className="text-[10.5px] text-gray-500">Mentions</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-gray-200">
                      <div className="text-lg font-bold text-gray-900">{twNegPct}%</div>
                      <div className="text-[10.5px] text-gray-500">Negative</div>
                    </div>
                  </div>
                  <div className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">
                    Top keywords
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(tw?.top_keywords || ['#AtomePH', '#BNPLPH', '#GCash', '@AtomePH']).map((k: string) => (
                      <span key={k} className="bg-white border border-gray-200 px-2 py-0.5 rounded-xl text-[11.5px] text-gray-700">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Reddit */}
            {(() => {
              const rd = channels.find((c) => c.platform === 'reddit');
              const rdTotal = rd?.total ?? 0;
              const rdNeg = rd?.negative ?? 0;
              const rdNegPct = rdTotal > 0 ? Math.round((rdNeg / rdTotal) * 100) : 0;
              return (
                <div className="border border-gray-200 rounded-[10px] p-3.5 bg-gray-50">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#FF4500] text-white flex items-center justify-center font-extrabold text-sm">
                      R
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">Reddit</div>
                      <div className="text-[11px] text-gray-500">Long-form, thread-driven</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white rounded-lg p-2 border border-gray-200">
                      <div className="text-lg font-bold text-gray-900">{rdTotal}</div>
                      <div className="text-[10.5px] text-gray-500">Mentions</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 border border-gray-200">
                      <div className="text-lg font-bold text-gray-900">{rdNegPct}%</div>
                      <div className="text-[10.5px] text-gray-500">Negative</div>
                    </div>
                  </div>
                  <div className="text-[10.5px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">
                    Top subreddits
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUBREDDITS.map((s) => (
                      <span key={s} className="bg-white border border-gray-200 px-2 py-0.5 rounded-xl text-[11.5px] text-gray-700">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Incidents table */}
      <div className="bg-white rounded-[14px] border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between mb-3.5">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Top incidents needing attention</h3>
            <div className="text-xs text-gray-500 mt-0.5">
              Auto-clustered from related posts on X + Reddit · ranked by severity · click to expand
            </div>
          </div>
        </div>
        <IncidentTable incidents={incidents} />
      </div>
    </div>
  );
}
