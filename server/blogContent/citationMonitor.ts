/**
 * Per-client citation monitor.
 *
 * Runs weekly per Dominator client. For each query in the client's
 * `citationQueryBattery`:
 *   1. Send it to Claude with web_search enabled
 *   2. Parse the answer for mentions of the client's business name and
 *      competitor names
 *   3. Record one `client_citation_check` row per query
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 14.
 */

import Anthropic from "@anthropic-ai/sdk";
import { eq, and, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  clients,
  clientContentConfig,
  clientCitationCheck,
} from "../../drizzle/schema";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

const HAIKU_INPUT_COST = 1 / 1_000_000;
const HAIKU_OUTPUT_COST = 5 / 1_000_000;
const WEB_SEARCH_COST_PER_CALL = 0.01;

export interface CitationMonitorResult {
  configsChecked: number;
  queriesRun: number;
  errors: number;
}

export async function runCitationMonitor(): Promise<CitationMonitorResult> {
  const result: CitationMonitorResult = { configsChecked: 0, queriesRun: 0, errors: 0 };
  if (!ENV.blogContentAutomationEnabled) return result;

  const db = await getDb();
  if (!db) return result;

  const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000);
  const activeConfigs = await db
    .select()
    .from(clientContentConfig)
    .where(
      and(
        sql`${clientContentConfig.startedAt} IS NOT NULL`,
        isNull(clientContentConfig.pausedAt),
      ),
    );

  for (const config of activeConfigs) {
    try {
      const [latest] = await db
        .select({ createdAt: clientCitationCheck.createdAt })
        .from(clientCitationCheck)
        .where(eq(clientCitationCheck.contentConfigId, config.id))
        .orderBy(sql`${clientCitationCheck.createdAt} DESC`)
        .limit(1);
      if (latest && new Date(latest.createdAt) > sixDaysAgo) continue;

      const queries = (config.citationQueryBattery as string[] | null) ?? [];
      if (queries.length === 0) continue;

      const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, config.clientId));
      if (!client) continue;

      const runId = `client${config.clientId}_${new Date().toISOString().slice(0, 10)}_weekly`;
      const cap = 12;

      for (let i = 0; i < Math.min(queries.length, cap); i++) {
        const queryText = queries[i];
        const queryId = `q${i + 1}`;
        try {
          const check = await runOneCitationQuery(queryText, client.businessName);
          await db.insert(clientCitationCheck).values({
            clientId: config.clientId,
            contentConfigId: config.id,
            runId,
            queryId,
            queryText,
            llmProvider: "anthropic",
            llmModel: HAIKU_MODEL,
            groundedSearch: 1,
            mentionedClient: check.mentionedClient ? 1 : 0,
            mentionPosition: check.mentionPosition ?? null,
            mentionContext: check.mentionContext ?? null,
            competitorsMentioned: check.competitorsMentioned,
            sourcesCited: check.sourcesCited,
            fullAnswer: check.fullAnswer,
            costUsd: check.costUsd.toFixed(4),
            latencyMs: check.latencyMs,
            errorMessage: null,
          });
          result.queriesRun++;
        } catch (err) {
          await db.insert(clientCitationCheck).values({
            clientId: config.clientId,
            contentConfigId: config.id,
            runId,
            queryId,
            queryText,
            llmProvider: "anthropic",
            llmModel: HAIKU_MODEL,
            groundedSearch: 1,
            mentionedClient: 0,
            costUsd: "0",
            latencyMs: 0,
            errorMessage: (err as Error).message,
          });
          result.errors++;
        }
      }
      result.configsChecked++;
    } catch (err) {
      console.error(
        `[citationMonitor] error on config ${config.id}: ${(err as Error).message}`,
      );
      result.errors++;
    }
  }

  return result;
}

interface OneQueryResult {
  mentionedClient: boolean;
  mentionPosition: number | null;
  mentionContext: string | null;
  competitorsMentioned: string[];
  sourcesCited: string[];
  fullAnswer: string;
  costUsd: number;
  latencyMs: number;
}

async function runOneCitationQuery(
  queryText: string,
  businessName: string,
): Promise<OneQueryResult> {
  const start = Date.now();
  const msg = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2_000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content: `Search the web and answer this user query in the same style ChatGPT or Perplexity would when recommending a local business or service.

Query: ${queryText}

Give a thorough answer naming specific businesses where appropriate. List your top picks in order.`,
      },
    ],
  });

  const usage = msg.usage as { input_tokens: number; output_tokens: number };
  const webSearchCalls =
    (usage as unknown as { server_tool_use?: { web_search_requests?: number } })
      ?.server_tool_use?.web_search_requests ?? 1;
  const costUsd =
    usage.input_tokens * HAIKU_INPUT_COST +
    usage.output_tokens * HAIKU_OUTPUT_COST +
    webSearchCalls * WEB_SEARCH_COST_PER_CALL;

  const fullAnswer = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n\n");

  const lowerAnswer = fullAnswer.toLowerCase();
  const lowerName = businessName.toLowerCase();
  const mentionedClient = lowerAnswer.includes(lowerName);

  let mentionPosition: number | null = null;
  let mentionContext: string | null = null;
  if (mentionedClient) {
    const idx = lowerAnswer.indexOf(lowerName);
    const beforeMention = fullAnswer.slice(0, idx);
    const listMarkers = beforeMention.match(/^\s*(\d+)[.)]\s/gm) ?? [];
    mentionPosition = listMarkers.length + 1;
    const ctxStart = Math.max(0, idx - 40);
    const ctxEnd = Math.min(fullAnswer.length, idx + lowerName.length + 40);
    mentionContext = fullAnswer.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();
  }

  const competitorsMentioned: string[] = [];
  const candidatePattern = /(?:^|\n)\s*\d+[.)]\s*([A-Z][A-Za-z0-9 &'-]{2,40})/gm;
  let matchItem: RegExpExecArray | null;
  while ((matchItem = candidatePattern.exec(fullAnswer)) !== null) {
    const candidate = matchItem[1].trim();
    if (
      candidate.toLowerCase() !== lowerName &&
      !competitorsMentioned.includes(candidate)
    ) {
      competitorsMentioned.push(candidate);
    }
  }

  const sourcesCited = Array.from(
    new Set(
      (fullAnswer.match(/https?:\/\/[^\s)<>"']+/g) ?? []).map((u) =>
        u.replace(/[.,;:!?)\]]+$/, ""),
      ),
    ),
  );

  return {
    mentionedClient,
    mentionPosition,
    mentionContext,
    competitorsMentioned: competitorsMentioned.slice(0, 10),
    sourcesCited: sourcesCited.slice(0, 20),
    fullAnswer,
    costUsd,
    latencyMs: Date.now() - start,
  };
}
