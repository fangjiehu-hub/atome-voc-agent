// Design-doc authoritative enums

export const CATEGORIES = [
  { key: 'fraud', label: 'Fraud / Scam', color: '#DC2626' },
  { key: 'transaction', label: 'Transaction', color: '#F97316' },
  { key: 'refund', label: 'Refund', color: '#F59E0B' },
  { key: 'spend_limit', label: 'Spend Limit', color: '#EAB308' },
  { key: 'account', label: 'Account', color: '#84CC16' },
  { key: 'security', label: 'Security', color: '#EF4444' },
  { key: 'app_bug', label: 'App Bug', color: '#8B5CF6' },
  { key: 'customer_service', label: 'Customer Service', color: '#06B6D4' },
  { key: 'debt_collection', label: 'Debt Collection', color: '#E11D48' },
  { key: 'interest_rate', label: 'Interest Rate', color: '#F97316' },
  { key: 'not_negative', label: 'General Mentions', color: '#9CA3AF' },
] as const;

export const SUB_ISSUES = [
  'duplicate_charge', 'payment_declined', 'gcash_issue', 'bank_transfer_fail',
  'refund_delayed', 'merchant_dispute', 'cancellation_denied',
  'limit_too_low', 'limit_reduced', 'limit_increase_denied',
  'account_locked', 'login_fail', 'kyc_rejected',
  'app_crash', 'slow_loading', 'ui_confusing',
  'long_wait', 'unhelpful_agent', 'no_response',
  'harassment', 'threatening_calls', 'excessive_contact',
  'hidden_fees', 'overcharged', 'late_fee_dispute',
  'unauthorized_transaction', 'phishing', 'account_takeover',
] as const;

// Severity: backend stores none/low/medium/high/critical, UI shows S0-S4
export const SEVERITY_MAP = {
  none: { label: 'S0 INFO', color: '#9CA3AF', bg: '#F3F4F6', text: '#4B5563' },
  low: { label: 'S1 LOW', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  medium: { label: 'S2 MEDIUM', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  high: { label: 'S3 HIGH', color: '#F97316', bg: '#FFEDD5', text: '#9A3412' },
  critical: { label: 'S4 CRITICAL', color: '#DC2626', bg: '#FEE2E2', text: '#991B1B' },
} as const;

export const STATUS_MAP = {
  new: { label: 'New', bg: '#FEE2E2', text: '#991B1B' },
  acknowledged: { label: 'Acknowledged', bg: '#FEF3C7', text: '#92400E' },
  in_review: { label: 'In Review', bg: '#FEF3C7', text: '#92400E' },
  actioned: { label: 'Actioned', bg: '#DBEAFE', text: '#1E40AF' },
  resolved: { label: 'Resolved', bg: '#D1FAE5', text: '#065F46' },
  ignored: { label: 'Ignored', bg: '#F3F4F6', text: '#4B5563' },
} as const;

export const SUBREDDITS = [
  'r/PHCreditCards',
  'r/Philippines',
  'r/phinvest',
  'r/phcasual',
  'r/phfinance',
] as const;

export const PLATFORMS = [
  { key: 'twitter', label: 'X / Twitter', icon: '𝕏', color: '#0F172A' },
  { key: 'reddit', label: 'Reddit', icon: 'R', color: '#FF4500' },
] as const;

export const CADENCE_MAP = {
  immediate: { label: 'IMMEDIATE', bg: '#FEE2E2', text: '#991B1B' },
  queue: { label: 'QUEUE', bg: '#FEF3C7', text: '#92400E' },
  digest: { label: 'DIGEST', bg: '#DBEAFE', text: '#1E40AF' },
} as const;
