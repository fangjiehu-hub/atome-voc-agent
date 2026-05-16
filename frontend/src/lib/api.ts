import type { TimeRange } from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

function timeRangeParams(range: TimeRange): string {
  if (range.mode === 'custom') {
    return `since=${range.since}&until=${range.until}`;
  }
  return `days=${range.days}`;
}

// Analytics
export const getOverview = (range: TimeRange = { mode: 'preset', days: 7 }) =>
  fetchJSON<any>(`/api/analytics/overview?${timeRangeParams(range)}`);
export const getTrend = (range: TimeRange = { mode: 'preset', days: 7 }) =>
  fetchJSON<any>(`/api/analytics/trend?${timeRangeParams(range)}`);
export const getCategories = (range: TimeRange = { mode: 'preset', days: 7 }) =>
  fetchJSON<any>(`/api/analytics/categories?${timeRangeParams(range)}`);
export const getChannels = (range: TimeRange = { mode: 'preset', days: 7 }) =>
  fetchJSON<any>(`/api/analytics/channels?${timeRangeParams(range)}`);
export const getSeverityDistribution = (range: TimeRange = { mode: 'preset', days: 7 }) =>
  fetchJSON<any>(`/api/analytics/severity-distribution?${timeRangeParams(range)}`);
export const getDrilldown = (date: string) =>
  fetchJSON<any>(`/api/analytics/drilldown?date=${date}`);

// Posts
export const queryPosts = (params: Record<string, any>) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null))
  ).toString();
  return fetchJSON<any>(`/api/monitor/query?${qs}`);
};

// Incidents
export const getIncidents = (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null))
  ).toString();
  return fetchJSON<any>(`/api/incidents?${qs}`);
};
export const getIncident = (id: number) =>
  fetchJSON<any>(`/api/incidents/${id}`);
export const updateIncident = (id: number, data: any) =>
  fetchJSON<any>(`/api/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Alerts
export const getAlerts = (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null))
  ).toString();
  return fetchJSON<any>(`/api/alerts?${qs}`);
};
export const acknowledgeAlert = (id: number) =>
  fetchJSON<any>(`/api/alerts/${id}/ack`, { method: 'POST' });

// Feedback
export const getFeedback = (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null))
  ).toString();
  return fetchJSON<any>(`/api/feedback?${qs}`);
};
export const createFeedback = (data: any) =>
  fetchJSON<any>('/api/feedback', { method: 'POST', body: JSON.stringify(data) });

// Taxonomy
export const getTaxonomyCategories = () =>
  fetchJSON<any[]>('/api/taxonomy/categories');
export const getTaxonomySubIssues = () =>
  fetchJSON<any[]>('/api/taxonomy/sub-issues');

// Crawler
export const triggerCrawl = (platform: string, lookback_hours = 24) =>
  fetchJSON<any>('/api/crawler/run', {
    method: 'POST',
    body: JSON.stringify({ platform, lookback_hours }),
  });

// Auth
export const login = (email: string, password: string) =>
  fetchJSON<any>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
export const register = (data: any) =>
  fetchJSON<any>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });

// Routing Rules
export const getRoutingRules = () =>
  fetchJSON<any>('/api/routing');
export const createRoutingRule = (data: any) =>
  fetchJSON<any>('/api/routing', { method: 'POST', body: JSON.stringify(data) });
export const updateRoutingRule = (id: number, data: any) =>
  fetchJSON<any>(`/api/routing/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteRoutingRule = (id: number) =>
  fetchJSON<any>(`/api/routing/${id}`, { method: 'DELETE' });

// Lark Bots
export const getLarkBots = () => fetchJSON<any[]>('/api/lark-bots');
export const createLarkBot = (data: any) =>
  fetchJSON<any>('/api/lark-bots', { method: 'POST', body: JSON.stringify(data) });
export const updateLarkBot = (id: number, data: any) =>
  fetchJSON<any>(`/api/lark-bots/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteLarkBot = (id: number) =>
  fetchJSON<any>(`/api/lark-bots/${id}`, { method: 'DELETE' });
export const testLarkBot = (id: number) =>
  fetchJSON<any>(`/api/lark-bots/${id}/test`, { method: 'POST' });
