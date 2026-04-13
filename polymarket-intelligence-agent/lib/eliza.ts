import { randomUUID } from "node:crypto";

import { ElizaClient } from "@elizaos/api-client";
import { z } from "zod";

import type {
  AnalystPersona,
  Market,
  Signal,
  SignalReasoningSections,
} from "@/lib/types";
import { clamp, randomFloat } from "@/lib/utils";

// --------------------------------------------------------------------------
// Schema for Eliza agent responses (both REST and SSE pub/sub events)
// --------------------------------------------------------------------------
const ElizaResponseSchema = z.object({
  signal: z.enum(["MISPRICED", "MOMENTUM", "ARBITRAGE", "BREAKING_NEWS"]),
  confidence: z.coerce.number(),
  reasoning: z.union([
    z.string(),
    z.object({
      marketContext: z.string(),
      sentimentAnalysis: z.string(),
      finalVerdict: z.string(),
    }),
  ]),
  fairPrice: z.coerce.number().optional(),
  action: z.enum(["BUY", "SELL", "MONITOR"]),
  // SSE responses include the originating market context
  market: z.string().optional(),
  probability: z.coerce.number().optional(),
});

const ElizaSignalListSchema = z.object({
  signals: z.array(
    z.object({
      market: z.string(),
      probability: z.coerce.number(),
      signal: z.enum(["MISPRICED", "MOMENTUM", "ARBITRAGE", "BREAKING_NEWS"]),
      confidence: z.coerce.number(),
      reasoning: z.union([
        z.string(),
        z.object({
          marketContext: z.string(),
          sentimentAnalysis: z.string(),
          finalVerdict: z.string(),
        }),
      ]),
      fairPrice: z.coerce.number().optional(),
      action: z.enum(["BUY", "SELL", "MONITOR"]),
    }),
  ),
});

// --------------------------------------------------------------------------
// Mock signal generator – used when Eliza is unreachable
// --------------------------------------------------------------------------
export function buildMockSignal(market: Market): Signal {
  const score = Math.abs(0.5 - market.probability);
  const confidence = clamp(
    0.55 + score * 0.8 + randomFloat(-0.08, 0.08),
    0.5,
    0.97,
  );

  let signal: Signal["signal"] = "MOMENTUM";
  let action: Signal["action"] = "MONITOR";
  let fairPrice = clamp(
    market.probability + randomFloat(-0.08, 0.08),
    0.01,
    0.99,
  );
  let reasoning =
    "Order flow and implied probability are balanced; monitor for a catalyst.";

  if (market.probability < 0.35 && confidence > 0.7) {
    signal = "MISPRICED";
    action = "BUY";
    fairPrice = clamp(market.probability + randomFloat(0.06, 0.16), 0.01, 0.99);
    reasoning =
      "The market appears to underprice this outcome relative to recent information velocity.";
  } else if (market.probability > 0.72 && confidence > 0.68) {
    signal = "MOMENTUM";
    action = "SELL";
    fairPrice = clamp(market.probability - randomFloat(0.05, 0.13), 0.01, 0.99);
    reasoning =
      "Price has stretched after momentum acceleration, increasing mean reversion risk.";
  } else if (market.volume > 4_000_000 && confidence > 0.66) {
    signal = "ARBITRAGE";
    action = "MONITOR";
    reasoning =
      "High liquidity and cross-market dispersion suggest potential hedged spread opportunities.";
  }

  return {
    market: market.question,
    probability: market.probability,
    signal,
    confidence,
    reasoning,
    fairPrice,
    reasoningSections: {
      marketContext: `Market probability ${market.probability.toFixed(2)} with volume ${Math.round(market.volume).toLocaleString()}.`,
      sentimentAnalysis:
        signal === "MOMENTUM"
          ? "Momentum appears extended and may mean-revert soon."
          : signal === "MISPRICED"
            ? "Recent context implies higher probability than current pricing."
            : "Sentiment is mixed and no directional edge dominates yet.",
      finalVerdict: reasoning,
    },
    action,
    timestamp: new Date().toISOString(),
  };
}

function personaInstruction(persona?: AnalystPersona): string {
  switch (persona) {
    case "CONTRARIAN":
      return "Persona: The Contrarian. Look for weak assumptions in crowded YES trades and highlight robust NO-side logic when justified.";
    case "QUANT":
      return "Persona: The Quant. Prioritize liquidity, volume shifts, and probability dislocations over narrative.";
    case "NEWS_JUNKIE":
      return "Persona: The News Junkie. Weight recent headlines, sentiment velocity, and narrative regime shifts.";
    default:
      return "Persona: Balanced analyst. Combine fundamentals, flow, and sentiment without overfitting to one style.";
  }
}

function reasoningToText(reasoning: string | SignalReasoningSections): string {
  if (typeof reasoning === "string") return reasoning;
  return [
    `Market Context: ${reasoning.marketContext}`,
    `Sentiment Analysis: ${reasoning.sentimentAnalysis}`,
    `Final Verdict: ${reasoning.finalVerdict}`,
  ].join("\n");
}

function reasoningToSections(
  reasoning: string | SignalReasoningSections,
): SignalReasoningSections | undefined {
  if (typeof reasoning !== "string") return reasoning;
  const lines = reasoning
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return undefined;
  const marketContext =
    lines.find((l) => l.toLowerCase().startsWith("market context:")) ??
    lines[0] ??
    "";
  const sentimentAnalysis =
    lines.find((l) => l.toLowerCase().startsWith("sentiment analysis:")) ??
    lines[1] ??
    lines[0] ??
    "";
  const finalVerdict =
    lines.find((l) => l.toLowerCase().startsWith("final verdict:")) ??
    lines.at(-1) ??
    "";
  return {
    marketContext: marketContext.replace(/^market context:\s*/i, ""),
    sentimentAnalysis: sentimentAnalysis.replace(
      /^sentiment analysis:\s*/i,
      "",
    ),
    finalVerdict: finalVerdict.replace(/^final verdict:\s*/i, ""),
  };
}

function getElizaClient() {
  const baseUrl = (
    process.env.ELIZA_AGENT_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");
  return ElizaClient.create({ baseUrl });
}

function getElizaBaseUrl() {
  return (process.env.ELIZA_AGENT_URL ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  );
}

/** Returns false quickly if the Eliza agent process is unreachable. */
async function isElizaReachable(): Promise<boolean> {
  const baseUrl = getElizaBaseUrl();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${baseUrl}/healthz`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Direct OpenRouter fallback — used when Eliza/Nosana is unavailable.
 * Requires OPENROUTER_API_KEY in env.
 */
export async function analyzeWithOpenRouter(
  markets: Market[],
  strategyPrompt?: string,
  persona?: AnalystPersona,
): Promise<Signal[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-3-haiku";
  const prompt = buildAnalysisPrompt(markets, strategyPrompt, persona);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/pwilson77/agent-challenge",
        "X-Title": "Polymarket Intelligence Agent",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  return parseSignalsFromAgent(raw, markets);
}

type ElizaUuid = `${string}-${string}-${string}-${string}-${string}`;

function asElizaUuid(value: string): ElizaUuid {
  return value as ElizaUuid;
}

const DEFAULT_MESSAGE_SERVER_ID: ElizaUuid =
  "00000000-0000-0000-0000-000000000000";
const DEFAULT_ELIZA_USER_ID: ElizaUuid = "00000000-0000-0000-0000-000000000001";

async function postChannelMessage(
  baseUrl: string,
  channelId: string,
  authorId: string,
  content: string,
): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/messaging/central-channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
        server_id: DEFAULT_MESSAGE_SERVER_ID,
        author_id: authorId,
        content,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to post channel message (${response.status})`);
  }
}

async function resolveAgentId(
  client: ReturnType<typeof getElizaClient>,
): Promise<ElizaUuid> {
  const explicit = process.env.ELIZA_AGENT_ID?.trim();
  if (explicit) return asElizaUuid(explicit);

  const listed = await client.agents.listAgents();
  const first = listed.agents?.[0]?.id;
  if (!first) {
    throw new Error(
      "No Eliza agents found. Set ELIZA_AGENT_ID or start an agent.",
    );
  }
  return asElizaUuid(first);
}

async function getOrCreateAnalysisChannel(
  client: ReturnType<typeof getElizaClient>,
  agentId: ElizaUuid,
  userId: ElizaUuid,
) {
  const channel = await client.messaging.getOrCreateDmChannel({
    participantIds: [agentId, userId],
  });

  try {
    await client.messaging.addAgentToChannel(channel.id as ElizaUuid, agentId);
  } catch {
    // Non-fatal: DM channel may already include the agent.
  }

  return channel;
}

function buildAnalysisPrompt(
  markets: Market[],
  strategyPrompt?: string,
  persona?: AnalystPersona,
): string {
  const compactMarkets = markets.map((m) => ({
    market: m.question,
    probability: Number(m.probability.toFixed(4)),
    volume: Math.round(m.volume),
  }));

  return [
    "You are a market analysis agent.",
    personaInstruction(persona),
    strategyPrompt?.trim() ||
      "Use robust probabilistic reasoning and current market context.",
    "Analyze each market and return STRICT JSON only with this exact shape:",
    '{"signals":[{"market":"string","probability":0.0,"fairPrice":0.0,"signal":"MISPRICED|MOMENTUM|ARBITRAGE|BREAKING_NEWS","confidence":0.0,"reasoning":{"marketContext":"string","sentimentAnalysis":"string","finalVerdict":"string"},"action":"BUY|SELL|MONITOR"}]}',
    "Rules:",
    "- Return one signal per input market.",
    "- confidence must be between 0 and 1.",
    "- fairPrice must be between 0 and 1.",
    "- No markdown, no prose, no code fences.",
    "Input markets:",
    JSON.stringify(compactMarkets),
  ].join("\n");
}

function extractJsonCandidate(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
}

function parseSignalsFromAgent(rawText: string, markets: Market[]): Signal[] {
  const jsonText = extractJsonCandidate(rawText);
  const parsedJson = JSON.parse(jsonText) as unknown;
  const parsed = ElizaSignalListSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("Agent response did not match expected JSON signal schema");
  }

  return parsed.data.signals.map((s, idx) => {
    const fallback = markets[idx] ?? markets[0];
    const reasoningSections = reasoningToSections(s.reasoning);
    return {
      market: s.market || fallback?.question || "",
      probability: Number.isFinite(s.probability)
        ? s.probability
        : (fallback?.probability ?? 0),
      signal: s.signal,
      confidence: clamp(s.confidence, 0, 1),
      fairPrice: Number.isFinite(s.fairPrice)
        ? clamp(Number(s.fairPrice), 0, 1)
        : undefined,
      reasoningSections,
      reasoning: reasoningToText(s.reasoning),
      action: s.action,
      timestamp: new Date().toISOString(),
    };
  });
}

async function waitForChannelReply(
  client: ReturnType<typeof getElizaClient>,
  channelId: ElizaUuid,
  agentId: ElizaUuid,
  markets: Market[],
  abortSignal?: AbortSignal,
): Promise<Signal[]> {
  const initial = await client.messaging.getChannelMessages(channelId, {
    limit: 25,
  });
  const seen = new Set(initial.messages.map((m) => m.id));

  const maxAttempts = 8;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (abortSignal?.aborted) {
      throw new Error("Aborted while waiting for Eliza channel response");
    }

    const res = await client.messaging.getChannelMessages(channelId, {
      limit: 30,
    });
    for (const msg of res.messages) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      if (String(msg.authorId) !== agentId) continue;
      if (!msg.content) continue;

      try {
        const parsedSignals = parseSignalsFromAgent(
          String(msg.content),
          markets,
        );
        if (parsedSignals.length > 0) {
          return parsedSignals;
        }
      } catch {
        // Ignore non-JSON agent chatter and keep polling.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Timed out waiting for Eliza channel response");
}

async function waitForAgentReply(
  client: ReturnType<typeof getElizaClient>,
  sessionId: ElizaUuid,
  abortSignal?: AbortSignal,
): Promise<string> {
  const initial = await client.sessions.getMessages(sessionId);
  const seen = new Set(initial.messages.map((m) => m.id));

  const maxAttempts = 35;
  for (let i = 0; i < maxAttempts; i += 1) {
    if (abortSignal?.aborted) {
      throw new Error("Aborted while waiting for Eliza response");
    }

    const res = await client.sessions.getMessages(sessionId);
    for (const msg of res.messages) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      if (!msg.isAgent || !msg.content) continue;
      return String(msg.content);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Timed out waiting for Eliza session response");
}

export async function analyzeMarketsWithElizaSession(
  markets: Market[],
  abortSignal?: AbortSignal,
): Promise<Signal[]> {
  const client = getElizaClient();
  const agentId = await resolveAgentId(client);
  const userId = asElizaUuid(
    process.env.ELIZA_USER_ID?.trim() || DEFAULT_ELIZA_USER_ID,
  );

  const session = await client.sessions.createSession({
    agentId,
    userId,
    metadata: { platform: "polymarket-intelligence-agent" },
  });

  await client.sessions.sendMessage(session.sessionId, {
    content: buildAnalysisPrompt(markets),
  });

  const raw = await waitForAgentReply(
    client,
    asElizaUuid(session.sessionId),
    abortSignal,
  );
  return parseSignalsFromAgent(raw, markets);
}

export async function analyzeMarketsWithElizaChannel(
  markets: Market[],
  abortSignal?: AbortSignal,
  strategyPrompt?: string,
  persona?: AnalystPersona,
): Promise<Signal[]> {
  // Try the Eliza channel when the agent process is reachable.
  if (await isElizaReachable()) {
    try {
      const baseUrl = getElizaBaseUrl();
      const client = getElizaClient();
      const agentId = await resolveAgentId(client);
      const userId = asElizaUuid(
        process.env.ELIZA_USER_ID?.trim() || DEFAULT_ELIZA_USER_ID,
      );
      const channel = await getOrCreateAnalysisChannel(client, agentId, userId);

      await postChannelMessage(
        baseUrl,
        channel.id,
        userId,
        buildAnalysisPrompt(markets, strategyPrompt, persona),
      );

      return await waitForChannelReply(
        client,
        channel.id as ElizaUuid,
        agentId,
        markets,
        abortSignal,
      );
    } catch (elizaErr) {
      // Eliza process is up but LLM (Nosana) is likely down — fall through.
      console.warn(
        "[eliza] channel analysis failed, attempting OpenRouter fallback:",
        elizaErr instanceof Error ? elizaErr.message : elizaErr,
      );
    }
  }

  // Fallback: call OpenRouter directly if a key is configured.
  if (process.env.OPENROUTER_API_KEY) {
    return analyzeWithOpenRouter(markets, strategyPrompt, persona);
  }

  // No fallback available — return mock signals.
  return markets.map(buildMockSignal);
}

function chunkMarkets(markets: Market[], batchSize: number): Market[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const chunks: Market[][] = [];
  for (let i = 0; i < markets.length; i += size) {
    chunks.push(markets.slice(i, i + size));
  }
  return chunks;
}

export async function analyzeMarketsWithElizaChannelBatched(
  markets: Market[],
  options?: {
    batchSize?: number;
    abortSignal?: AbortSignal;
    strategyPrompt?: string;
    persona?: AnalystPersona;
    onBatchComplete?: (
      batchSignals: Signal[],
      batchIndex: number,
      totalBatches: number,
    ) => void;
  },
): Promise<Signal[]> {
  const batches = chunkMarkets(markets, options?.batchSize ?? 4);
  const mergedSignals: Signal[] = [];

  for (let i = 0; i < batches.length; i += 1) {
    if (options?.abortSignal?.aborted) {
      throw new Error("Aborted while analyzing batched markets");
    }

    const batchSignals = await analyzeMarketsWithElizaChannel(
      batches[i],
      options?.abortSignal,
      options?.strategyPrompt,
      options?.persona,
    );
    mergedSignals.push(...batchSignals);
    options?.onBatchComplete?.(batchSignals, i, batches.length);
  }

  return mergedSignals;
}

export async function resolveElizaAgentAndChannel() {
  const client = getElizaClient();
  const agentId = await resolveAgentId(client);
  const userId = asElizaUuid(
    process.env.ELIZA_USER_ID?.trim() || DEFAULT_ELIZA_USER_ID,
  );
  const channel = await getOrCreateAnalysisChannel(client, agentId, userId);
  return { baseUrl: getElizaBaseUrl(), agentId, userId, channelId: channel.id };
}

// --------------------------------------------------------------------------
// Step 1 – POST market data to the Eliza agent's REST endpoint
// Eliza will then asynchronously publish analysis results on its pub/sub channel
// --------------------------------------------------------------------------
export async function submitMarketsToEliza(markets: Market[]): Promise<void> {
  await analyzeMarketsWithElizaChannel(markets);
}

// --------------------------------------------------------------------------
// Step 2 – Subscribe to Eliza's SSE pub/sub channel
// Parses incoming events and calls onSignal for each validated Signal response
// Resolves when the stream closes or the abortSignal fires
// --------------------------------------------------------------------------
export async function streamElizaSignals(
  abortSignal: AbortSignal,
  onSignal: (signal: Signal) => void,
  onDone?: () => void,
): Promise<void> {
  const client = getElizaClient();
  const agentId = await resolveAgentId(client);
  const userId = asElizaUuid(process.env.ELIZA_USER_ID?.trim() || randomUUID());
  const session = await client.sessions.createSession({
    agentId,
    userId,
    metadata: { platform: "polymarket-intelligence-agent" },
  });

  const raw = await waitForAgentReply(
    client,
    asElizaUuid(session.sessionId),
    abortSignal,
  );
  const parsed = ElizaResponseSchema.safeParse(
    JSON.parse(extractJsonCandidate(raw)) as unknown,
  );
  if (parsed.success) {
    const reasoningSections = reasoningToSections(parsed.data.reasoning);
    onSignal({
      market: parsed.data.market ?? "",
      probability: parsed.data.probability ?? 0,
      signal: parsed.data.signal,
      confidence: clamp(parsed.data.confidence, 0, 1),
      fairPrice: Number.isFinite(parsed.data.fairPrice)
        ? clamp(Number(parsed.data.fairPrice), 0, 1)
        : undefined,
      reasoningSections,
      reasoning: reasoningToText(parsed.data.reasoning),
      action: parsed.data.action,
      timestamp: new Date().toISOString(),
    });
  }
  onDone?.();
}

// --------------------------------------------------------------------------
// Legacy one-shot method – kept for the /api/signals snapshot route
// --------------------------------------------------------------------------
export async function analyzeMarket(market: Market): Promise<Signal> {
  const forceMock = process.env.POLYMARKET_MOCK_MODE === "true";

  if (forceMock) {
    return buildMockSignal(market);
  }

  try {
    const all = await analyzeMarketsWithElizaChannel([market]);
    return all[0] ?? buildMockSignal(market);
  } catch {
    return buildMockSignal(market);
  }
}
