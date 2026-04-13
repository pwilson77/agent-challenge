import axios from "axios";
import { z } from "zod";

import { clamp, hashString } from "@/lib/utils";
import type { Market } from "@/lib/types";

const JUPITER_PREDICTION_API = "https://prediction-market-api.jup.ag";
const KALSHI_PROVIDER = "kalshi";
const CACHE_TTL_MS = 60_000;

const RawPricingSchema = z
  .object({
    buyYesPriceUsd: z.coerce.number().optional(),
    buyNoPriceUsd: z.coerce.number().optional(),
    volume: z.coerce.number().optional(),
  })
  .partial();

const RawMarketSchema = z
  .object({
    marketId: z.string().optional(),
    id: z.string().optional(),
    eventId: z.string().optional(),
    title: z.string().optional(),
    question: z.string().optional(),
    outcomes: z.array(z.union([z.string(), z.number()])).optional(),
    outcomePrices: z
      .union([z.array(z.union([z.string(), z.number()])), z.string()])
      .optional(),
    pricing: RawPricingSchema.optional(),
    volume: z.coerce.number().optional(),
    closeTime: z.coerce.number().optional(),
    resolveAt: z.string().optional(),
    clobTokenIds: z.array(z.string()).optional(),
    status: z.string().optional(),
  })
  .passthrough();

const RawEventSchema = z
  .object({
    markets: z.array(RawMarketSchema).optional(),
  })
  .passthrough();

const RawEventsResponseSchema = z
  .object({
    events: z.array(RawEventSchema).optional(),
  })
  .passthrough();

const RawDataEnvelopeSchema = z
  .object({
    data: z.array(z.unknown()).optional(),
  })
  .passthrough();

const responseCache = new Map<string, { at: number; markets: Market[] }>();

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter((v) => v.length > 0);
      }
    } catch {
      return [value].map((v) => v.trim()).filter((v) => v.length > 0);
    }
  }
  return undefined;
}

function parseNumberArray(value: unknown): number[] {
  const parsed = parseStringArray(value);
  if (!parsed) return [];
  return parsed
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((v) => clamp(v, 0, 1));
}

function normalizeKalshiMarket(
  rawMarket: z.infer<typeof RawMarketSchema>,
): Market {
  const externalId = rawMarket.marketId ?? rawMarket.id ?? "";
  const question =
    rawMarket.title?.trim() || rawMarket.question?.trim() || "Untitled market";
  const outcomePrices = parseNumberArray(rawMarket.outcomePrices);
  const outcomes = parseStringArray(rawMarket.outcomes);

  const probability = clamp(
    rawMarket.pricing?.buyYesPriceUsd ?? outcomePrices[0] ?? 0.5,
    0,
    1,
  );

  const volume = Number(rawMarket.pricing?.volume ?? rawMarket.volume ?? 0);
  const endDate =
    typeof rawMarket.closeTime === "number"
      ? new Date(rawMarket.closeTime * 1000).toISOString()
      : rawMarket.resolveAt;

  return {
    id: `kalshi:${externalId || hashString(question)}`,
    venue: "kalshi",
    externalId,
    question,
    probability,
    volume: Number.isFinite(volume) ? volume : 0,
    liquidity: Number.isFinite(volume) ? volume : 0,
    outcomes,
    outcomePrices: outcomePrices.length > 0 ? outcomePrices : undefined,
    endDate,
  };
}

function extractMarkets(payload: unknown): z.infer<typeof RawMarketSchema>[] {
  const parsedEnvelope = RawEventsResponseSchema.safeParse(payload);
  if (parsedEnvelope.success) {
    return (parsedEnvelope.data.events ?? []).flatMap((e) => e.markets ?? []);
  }

  const parsedDataEnvelope = RawDataEnvelopeSchema.safeParse(payload);
  if (parsedDataEnvelope.success) {
    const items = parsedDataEnvelope.data.data ?? [];
    const asEvents = z.array(RawEventSchema).safeParse(items);
    if (asEvents.success) {
      return asEvents.data.flatMap((e) => e.markets ?? []);
    }
    const asMarkets = z.array(RawMarketSchema).safeParse(items);
    if (asMarkets.success) {
      return asMarkets.data;
    }
  }

  const parsedArray = z.array(RawEventSchema).safeParse(payload);
  if (parsedArray.success) {
    return parsedArray.data.flatMap((e) => e.markets ?? []);
  }

  const directMarkets = z.array(RawMarketSchema).safeParse(payload);
  if (directMarkets.success) {
    return directMarkets.data;
  }

  return [];
}

export async function fetchKalshiMarkets(options?: {
  query?: string;
  limit?: number;
}): Promise<Market[]> {
  const query = options?.query?.trim() ?? "";
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const cacheKey = `${query}|${limit}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.markets;
  }

  try {
    const endpoint =
      query.length > 0 ? "/api/v1/events/search" : "/api/v1/events";
    const response = await axios.get<unknown>(
      `${JUPITER_PREDICTION_API}${endpoint}`,
      {
        params:
          query.length > 0
            ? {
                query,
                provider: KALSHI_PROVIDER,
                includeMarkets: true,
                start: 0,
                end: limit,
              }
            : {
                provider: KALSHI_PROVIDER,
                includeMarkets: true,
                filter: "live",
                sortBy: "volume24hr",
                sortDirection: "desc",
                start: 0,
                end: limit,
              },
        timeout: 12_000,
        headers: {
          Accept: "application/json",
        },
      },
    );

    const markets = extractMarkets(response.data)
      .map(normalizeKalshiMarket)
      .filter((m) => m.question.length > 0);

    responseCache.set(cacheKey, { at: Date.now(), markets });
    return markets;
  } catch {
    // Comparison endpoint should degrade gracefully when Jupiter is unavailable.
    return [];
  }
}
