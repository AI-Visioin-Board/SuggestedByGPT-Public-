/**
 * Shared constants, types, and utilities for the AI Visibility Scanner.
 * Used by both /scan (Scan.tsx) and /start (FunnelStart.tsx).
 */

// ============================================================================
// Constants
// ============================================================================

export const INDUSTRIES = [
  'Dental',
  'Legal',
  'Home Services',
  'Real Estate',
  'Restaurant',
  'Medical',
  'Accounting',
  'Auto Repair',
  'Fitness',
  'Insurance',
  'Other',
] as const;

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
] as const;

export const SCANNING_MESSAGES = [
  'Checking structured data...',
  'Auditing robots.txt...',
  'Looking for llms.txt...',
  'Measuring page speed...',
  'Scanning directory listings...',
  'Analyzing reviews...',
  'Checking content signals...',
  'Calculating score...',
] as const;

/** Funnel-specific scanning messages (AI assistant focused) */
export const FUNNEL_SCANNING_MESSAGES = [
  'Checking ChatGPT...',
  'Checking Gemini...',
  'Checking Claude...',
  'Checking Perplexity...',
  'Scanning directory listings...',
  'Analyzing your visibility...',
  'Building your scorecard...',
] as const;

export const GRADE_COLORS: Record<string, string> = {
  A: '#4CAF50',
  B: '#8BC34A',
  C: '#FFC107',
  D: '#FF9800',
  F: '#F44336',
};

export const GRADE_LABELS: Record<string, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Moderate',
  D: 'Poor',
  F: 'Invisible',
};

export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  schema_structured_data: { label: 'Schema & Structured Data', icon: '{ }' },
  ai_crawler_access: { label: 'AI Crawler Access', icon: '🤖' },
  technical_seo: { label: 'Technical SEO', icon: '⚙️' },
  content_signals: { label: 'Content Signals', icon: '📝' },
  directory_presence: { label: 'Directory Presence', icon: '📍' },
  review_signals: { label: 'Review Signals', icon: '⭐' },
};

// ============================================================================
// Types
// ============================================================================

export interface ScanFormData {
  website_url: string;
  business_name: string;
  industry: string;
  city: string;
  state: string;
  contact_name: string;
  contact_email: string;
}

export interface CategoryScore {
  score: number;
  max_score: number;
  data_source?: string;
  findings?: string[];
}

export interface ScanResponse {
  scan_id: string;
  lead_id: string;
  scan_date: string;
  business: {
    name: string;
    website: string;
    city: string;
    state: string;
    industry: string;
  };
  scores: Record<string, CategoryScore>;
  overall: {
    score: number;
    grade: string;
    label: string;
  };
  top_recommendations?: string[];
  grade_scale: Record<string, string>;
  gated?: boolean;
  gated_message?: string;
  crawlers_blocked?: boolean;
  crawlers_blocked_all?: boolean;
  crawlers_blocked_names?: string[];
}

export const EMPTY_FORM_DATA: ScanFormData = {
  website_url: '',
  business_name: '',
  industry: '',
  city: '',
  state: '',
  contact_name: '',
  contact_email: '',
};
