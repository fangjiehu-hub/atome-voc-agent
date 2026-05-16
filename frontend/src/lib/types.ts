export interface Post {
  id: number;
  platform: string;
  brand: string;
  post_id: string;
  url: string | null;
  author_handle: string | null;
  content_text: string | null;
  created_at: string | null;
  collected_at: string;
  engagement_likes: number;
  engagement_replies: number;
  engagement_reposts: number;
  is_negative: boolean | null;
  category: string | null;
  sub_issues: string[] | null;
  severity: string | null;
  language: string | null;
  summary: string | null;
  ai_explanation: string | null;
  annotated_at: string | null;
  incident_id: number | null;
  is_reviewed: boolean;
}

export interface Incident {
  id: number;
  incident_code: string;
  title: string;
  summary: string | null;
  category: string | null;
  severity: string;
  platforms: string[] | null;
  post_count: number;
  first_seen: string | null;
  last_seen: string | null;
  trend_pct: number | null;
  status: string;
  assigned_to: number | null;
  assigned_dept: string | null;
  created_at: string;
  updated_at: string;
  source_url: string | null;
  source_created_at: string | null;
  source_author: string | null;
}

export interface Alert {
  id: number;
  incident_id: number | null;
  post_id: number | null;
  alert_type: string;
  severity: string;
  channel: string;
  recipients: string[] | null;
  subject: string | null;
  body: string | null;
  delivery_status: string;
  acknowledged_at: string | null;
  sent_at: string | null;
  created_at: string;
  source_url: string | null;
  source_created_at: string | null;
  source_author: string | null;
}

export interface Feedback {
  id: number;
  object_type: string;
  object_id: number;
  field_name: string;
  original_value: string | null;
  corrected_value: string | null;
  reason: string | null;
  reviewer_id: number | null;
  created_at: string;
}

export interface KPIOverview {
  total_mentions: number;
  negative_complaints: number;
  negative_pct: number;
  critical_incidents: number;
  open_incidents: number;
  avg_detect_to_alert_min: number | null;
  prev_total_mentions: number;
  prev_negative_pct: number;
  prev_critical_incidents: number;
  prev_open_incidents: number;
  prev_avg_detect_to_alert_min: number | null;
}

export interface TrendPoint {
  date: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  none: number;
}

export interface CategoryCount {
  category: string;
  count: number;
  pct: number;
}

export interface SeverityCount {
  severity: string;
  count: number;
  pct: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type TimeRange =
  | { mode: 'preset'; days: number }
  | { mode: 'custom'; since: string; until: string }; // YYYY-MM-DD
