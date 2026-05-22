/**
 * Claude API Client
 *
 * Replaces Manus forge LLM with Anthropic Claude API.
 * Drop-in replacement that maintains the same InvokeResult interface
 * so all existing modules continue to work.
 */

export type Role = 'system' | 'user' | 'assistant';

export type Message = {
  role: Role;
  content: string;
};

export type ClaudeResponse = {
  id: string;
  model: string;
  content: Array<{ type: 'text'; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason: string;
};

// Maintains backward compatibility with the old InvokeResult shape
export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type InvokeParams = {
  messages: Message[];
  maxTokens?: number;
  max_tokens?: number;
  response_format?: {
    type: 'json_schema' | 'json_object' | 'text';
    json_schema?: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  temperature?: number;
};

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7-20260416';
const CLAUDE_API_VERSION = '2023-06-01';

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Set it in your environment variables.');
  }
  return key;
}

/**
 * Invoke Claude API with backward-compatible interface.
 *
 * Accepts the same message format as the old invokeLLM() and returns
 * the same InvokeResult shape, so all existing generators work without changes.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = getApiKey();
  const maxTokens = params.maxTokens || params.max_tokens || 8192;

  // Separate system message from conversation messages
  const systemMessages = params.messages.filter(m => m.role === 'system');
  const conversationMessages = params.messages.filter(m => m.role !== 'system');

  // Build system prompt
  let systemPrompt = systemMessages.map(m =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  ).join('\n\n');

  // If JSON output is requested, add instruction to system prompt
  if (params.response_format?.type === 'json_schema' || params.response_format?.type === 'json_object') {
    const schemaInstruction = params.response_format.json_schema
      ? `\n\nYou MUST respond with valid JSON that conforms to this schema:\n${JSON.stringify(params.response_format.json_schema.schema, null, 2)}\n\nRespond ONLY with the JSON object, no markdown, no code fences, no explanation.`
      : '\n\nYou MUST respond with valid JSON. No markdown, no code fences, no explanation.';
    systemPrompt += schemaInstruction;
  }

  // Format messages for Claude API
  const claudeMessages = conversationMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  // Ensure conversation starts with user message (Claude requirement)
  if (claudeMessages.length === 0 || claudeMessages[0].role !== 'user') {
    claudeMessages.unshift({ role: 'user', content: 'Please proceed with the task.' });
  }

  const payload: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: claudeMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  if (params.temperature !== undefined) {
    payload.temperature = params.temperature;
  }

  // Retry with exponential backoff for transient failures (429 rate limit, 5xx server errors)
  const MAX_RETRIES = 3;
  let claudeResponse: ClaudeResponse | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_API_VERSION,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      claudeResponse = (await response.json()) as ClaudeResponse;
      break;
    }

    const errorText = await response.text();
    const error = new Error(`Claude API failed: ${response.status} ${response.statusText} – ${errorText}`);

    // Only retry on rate limit (429) or server errors (500+)
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 30000);
      console.warn(`[Claude] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${response.status}), retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    // Non-retryable error (4xx other than 429) or final attempt — throw
    throw error;
  }

  if (!claudeResponse) throw new Error('Claude API failed after all retries');

  // Extract text content from Claude response
  const textContent = claudeResponse.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Convert to backward-compatible InvokeResult format
  return {
    id: claudeResponse.id,
    created: Date.now(),
    model: claudeResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
        },
        finish_reason: claudeResponse.stop_reason === 'end_turn' ? 'stop' : claudeResponse.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: claudeResponse.usage.input_tokens,
      completion_tokens: claudeResponse.usage.output_tokens,
      total_tokens: claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens,
    },
  };
}

/**
 * Simple text generation helper for cases where you just need a string response.
 */
export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: Message[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const result = await invokeLLM({ messages });
  return result.choices[0].message.content;
}

/**
 * JSON generation helper that parses the response automatically.
 */
export async function generateJSON<T = unknown>(prompt: string, systemPrompt?: string): Promise<T> {
  const messages: Message[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const result = await invokeLLM({
    messages,
    response_format: { type: 'json_object' },
  });

  const content = result.choices[0].message.content;
  // Strip any markdown code fences if present
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned) as T;
}
