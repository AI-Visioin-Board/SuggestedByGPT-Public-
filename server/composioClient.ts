/**
 * Composio v3 REST API client (minimal — just what we need for Gmail).
 *
 * Composio is the platform we use to access info@suggestedbygpt.com's Gmail
 * (and other connected accounts) from server-side code. The connected-account
 * IDs (`ca_...`) live in the user's Composio dashboard. We only use this for
 * read-only verification flows — e.g. detecting Google Business Profile
 * manager-invite emails — never for sending.
 *
 * Verified May 2026:
 *   - Base URL:   https://backend.composio.dev/api/v3
 *   - Endpoint:   POST /tools/execute/{ACTION_SLUG}
 *   - Auth:       header `x-api-key: <COMPOSIO_API_KEY>`
 *   - Body:       { connected_account_id, arguments }
 *   - Action for Gmail search: GMAIL_FETCH_EMAILS
 *   - Args:       { query, max_results, include_payload?, verbose? }
 *   - Response:   { data: { messages: [...] }, error?, successful }
 *
 * If Composio changes the wire format, adjust executeAction() — the rest of
 * the codebase calls semantic helpers (searchInfoGmail) that abstract it.
 *
 * Env required:
 *   COMPOSIO_API_KEY                — master API key (one per Composio org)
 *   COMPOSIO_INFO_GMAIL_ACCOUNT_ID  — e.g. "ca_V4xqYo4C8M_p" — info@suggestedbygpt.com
 */

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;       // ISO timestamp from Gmail
  snippet: string;    // Short preview (first ~200 chars)
  body?: string;      // Full body if include_payload was true
}

export class ComposioError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message);
    this.name = 'ComposioError';
  }
}

interface ComposioResponse<T> {
  data?: T;
  error?: string | { message?: string; code?: string };
  successful?: boolean;
}

/**
 * Internal: hit POST /tools/execute/{action} with the given arguments and
 * connected-account routing. Throws ComposioError on any non-2xx response or
 * when the API returns `successful: false` / a populated `error` field.
 */
async function executeAction<T = any>(
  actionSlug: string,
  args: Record<string, unknown>,
  connectedAccountId: string,
): Promise<T> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new ComposioError(0, null, 'COMPOSIO_API_KEY not set');
  }

  const url = `${COMPOSIO_BASE}/tools/execute/${actionSlug}`;
  const body = {
    connected_account_id: connectedAccountId,
    arguments: args,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ComposioError(0, null, `Composio network error on ${actionSlug}: ${(err as Error).message}`);
  }

  const text = await res.text();
  let json: ComposioResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ComposioResponse<T>) : null;
  } catch {
    // Body wasn't JSON — surface raw text for debugging
  }

  if (!res.ok) {
    throw new ComposioError(
      res.status,
      json ?? text,
      `Composio ${actionSlug} HTTP ${res.status}${json?.error ? `: ${typeof json.error === 'string' ? json.error : json.error.message}` : ''}`,
    );
  }

  if (!json) {
    throw new ComposioError(res.status, text, `Composio ${actionSlug} returned non-JSON body`);
  }

  if (json.successful === false || json.error) {
    const errMsg = typeof json.error === 'string' ? json.error : (json.error?.message || 'unknown error');
    throw new ComposioError(res.status, json, `Composio ${actionSlug} failed: ${errMsg}`);
  }

  return json.data as T;
}

/**
 * Search the info@suggestedbygpt.com inbox using Gmail's advanced search syntax.
 * Common operators: from:, to:, subject:, has:, after:, before:, label:.
 *
 * Defensive parsing — Composio's response shape for GMAIL_FETCH_EMAILS has
 * varied across versions. We accept a few aliases for each field and fall
 * back to empty strings rather than throwing on missing data.
 */
export async function searchInfoGmail(
  query: string,
  options: { maxResults?: number; includePayload?: boolean } = {},
): Promise<GmailMessage[]> {
  const accountId = process.env.COMPOSIO_INFO_GMAIL_ACCOUNT_ID;
  if (!accountId) {
    throw new ComposioError(0, null, 'COMPOSIO_INFO_GMAIL_ACCOUNT_ID not set');
  }

  const data = await executeAction<any>('GMAIL_FETCH_EMAILS', {
    query,
    max_results: options.maxResults ?? 10,
    include_payload: options.includePayload ?? false,
    verbose: true,
  }, accountId);

  // Composio sometimes nests messages under data.messages, sometimes data.data.messages,
  // sometimes the array IS the data. Handle all three.
  let raw: any[] = [];
  if (Array.isArray(data)) raw = data;
  else if (Array.isArray(data?.messages)) raw = data.messages;
  else if (Array.isArray(data?.data?.messages)) raw = data.data.messages;
  else if (Array.isArray(data?.results)) raw = data.results;

  return raw.map((m: any) => ({
    id: m.id || m.messageId || m.message_id || '',
    threadId: m.threadId || m.thread_id || '',
    from: m.from || m.sender || m.headers?.from || '',
    subject: m.subject || m.headers?.subject || '',
    date: m.date || m.internalDate || m.timestamp || m.headers?.date || '',
    snippet: m.snippet || m.preview || (m.body || '').slice(0, 200) || '',
    body: m.body || m.payload?.body || undefined,
  }));
}

/** Quick check used by callers that want to gate on whether Composio is set up. */
export function isComposioConfigured(): boolean {
  return !!(process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_INFO_GMAIL_ACCOUNT_ID);
}
