import axios from "axios";
import { z } from "zod";

import { clamp, hashString, randomFloat } from "@/lib/utils";
import type { Market } from "@/lib/types";

const POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com/markets";
const POLYMARKET_PUBLIC_SEARCH_URL =
  "https://gamma-api.polymarket.com/public-search";

const RawMarketSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  conditionId: z.string().optional(),
  clobTokenIds: z.union([z.string(), z.array(z.string())]).optional(),
  outcomes: z
    .union([z.string(), z.array(z.union([z.string(), z.number()]))])
    .optional(),
  shortOutcomes: z
    .union([z.string(), z.array(z.union([z.string(), z.number()]))])
    .optional(),
  question: z.string().optional(),
  title: z.string().optional(),
  volume: z.coerce.number().optional(),
  volumeNum: z.coerce.number().optional(),
  liquidity: z.coerce.number().optional(),
  liquidityNum: z.coerce.number().optional(),
  endDate: z.string().optional(),
  end_date_iso: z.string().optional(),
  // Gamma API returns outcomePrices as a JSON-encoded string e.g. '["0.54","0.46"]'
  outcomePrices: z
    .union([z.string(), z.array(z.union([z.string(), z.number()]))])
    .optional(),
  lastTradePrice: z.union([z.string(), z.number()]).optional(),
});

const RawMarketsSchema = z.array(RawMarketSchema);
const PublicSearchResponseSchema = z.object({
  events: z
    .array(
      z.object({
        markets: z.array(RawMarketSchema).optional(),
      }),
    )
    .optional(),
  pagination: z
    .object({
      hasMore: z.boolean().optional(),
    })
    .optional(),
});

interface FetchGammaBatchOptions {
  limit: number;
  searchQuery: string;
  offset?: number;
}

interface FetchSearchMarketsOptions {
  limitPerType?: number;
  maxPages?: number;
}

function normalizeMarket(raw: z.infer<typeof RawMarketSchema>): Market {
  const id = String(
    raw.id ?? hashString(raw.question ?? raw.title ?? crypto.randomUUID()),
  );
  const question = raw.question ?? raw.title ?? "Untitled market";
  let clobTokenIdsArr: string[] | undefined;
  if (typeof raw.clobTokenIds === "string") {
    try {
      const parsed: unknown = JSON.parse(raw.clobTokenIds);
      if (Array.isArray(parsed))
        clobTokenIdsArr = parsed.filter(
          (v): v is string => typeof v === "string",
        );
    } catch {
      // ignore malformed
    }
  } else {
    clobTokenIdsArr = raw.clobTokenIds;
  }

  const parseStringOrArray = (
    value: string | (string | number)[] | undefined,
  ): string[] | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === "string") {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((v) => String(v).trim())
            .filter((v) => v.length > 0);
        }
      } catch {
        // leave as single string fallback below
      }
      return [value].map((v) => v.trim()).filter((v) => v.length > 0);
    }
    return value
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
  };

  // outcomePrices may be a JSON-encoded string (real Gamma API) or an actual array
  let outcomePricesArr: Array<string | number> | undefined;
  if (typeof raw.outcomePrices === "string") {
    try {
      const parsed: unknown = JSON.parse(raw.outcomePrices);
      if (Array.isArray(parsed))
        outcomePricesArr = parsed as Array<string | number>;
    } catch {
      // ignore malformed
    }
  } else {
    outcomePricesArr = raw.outcomePrices;
  }

  const outcomes = parseStringOrArray(raw.shortOutcomes ?? raw.outcomes);
  const outcomePrices = (outcomePricesArr ?? [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => clamp(value, 0, 1));

  const outcome0 = outcomePricesArr?.[0];
  const probabilityFromOutcome =
    outcome0 !== undefined ? Number(outcome0) : undefined;
  const probability = clamp(
    Number.isFinite(probabilityFromOutcome)
      ? Number(probabilityFromOutcome)
      : Number(raw.lastTradePrice ?? randomFloat(0.2, 0.8)),
    0,
    1,
  );

  const volume = Number(
    raw.volumeNum ??
      raw.volume ??
      raw.liquidityNum ??
      raw.liquidity ??
      randomFloat(10_000, 5_000_000),
  );
  const liquidity = Number(
    raw.liquidityNum ??
      raw.liquidity ??
      raw.volumeNum ??
      raw.volume ??
      randomFloat(10_000, 5_000_000),
  );

  return {
    id,
    conditionId: raw.conditionId,
    clobTokenId: clobTokenIdsArr?.[0],
    outcomes,
    outcomePrices: outcomePrices.length > 0 ? outcomePrices : undefined,
    outcomeTokenIds: clobTokenIdsArr,
    question,
    probability,
    volume,
    liquidity,
    endDate: raw.endDate ?? raw.end_date_iso,
  };
}

function getMockMarkets(): Market[] {
  return [
    {
      id: "mock-1",
      question: "Will the Fed cut rates by at least 25 bps this quarter?",
      probability: 0.42,
      volume: 2_400_000,
      liquidity: 1_750_000,
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
    {
      id: "mock-2",
      question: "Will Bitcoin exceed $120k before year end?",
      probability: 0.36,
      volume: 8_100_000,
      liquidity: 5_400_000,
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString(),
    },
    {
      id: "mock-3",
      question: "Will there be a US government shutdown this year?",
      probability: 0.27,
      volume: 1_650_000,
      liquidity: 980_000,
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 200).toISOString(),
    },
  ];
}

async function fetchGammaBatch({
  limit,
  searchQuery,
  offset,
}: FetchGammaBatchOptions): Promise<Market[]> {
  const response = await axios.get<unknown>(POLYMARKET_GAMMA_URL, {
    params: {
      active: true,
      closed: false,
      archived: false,
      limit,
      offset,
      search: searchQuery || undefined,
    },
    timeout: 12_000,
    headers: {
      Accept: "application/json",
    },
  });

  const parsed = RawMarketsSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(
      `Unexpected Polymarket response shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  return parsed.data
    .map(normalizeMarket)
    .filter((market) => market.question.length > 0);
}

export async function fetchSearchMarkets(
  searchQuery: string,
  options?: FetchSearchMarketsOptions,
): Promise<{
  markets: Market[];
  hasMore: boolean;
  source: "polymarket" | "mock";
}> {
  const forceMock = process.env.POLYMARKET_MOCK_MODE === "true";
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const applySearch = (input: Market[]) =>
    normalizedSearch.length === 0
      ? input
      : input.filter((m) =>
          m.question.toLowerCase().includes(normalizedSearch),
        );

  if (forceMock) {
    return {
      markets: applySearch(getMockMarkets()),
      hasMore: false,
      source: "mock",
    };
  }

  const limitPerType = Math.min(Math.max(options?.limitPerType ?? 50, 1), 100);
  const maxPages = Math.max(options?.maxPages ?? 8, 1);

  try {
    const byId = new Map<string, Market>();
    let hasMore = false;

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await axios.get<unknown>(POLYMARKET_PUBLIC_SEARCH_URL, {
        params: {
          q: normalizedSearch,
          page,
          limit_per_type: limitPerType,
          search_profiles: false,
          optimized: true,
        },
        timeout: 12_000,
        headers: {
          Accept: "application/json",
        },
      });

      const parsed = PublicSearchResponseSchema.safeParse(response.data);
      if (!parsed.success) {
        throw new Error(
          `Unexpected public-search response shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        );
      }

      const events = parsed.data.events ?? [];
      for (const event of events) {
        for (const rawMarket of event.markets ?? []) {
          const market = normalizeMarket(rawMarket);
          if (!byId.has(market.id)) {
            byId.set(market.id, market);
          }
        }
      }

      hasMore = parsed.data.pagination?.hasMore ?? false;
      if (!hasMore) break;
    }

    return {
      markets: applySearch(Array.from(byId.values())),
      hasMore,
      source: "polymarket",
    };
  } catch {
    return {
      markets: applySearch(getMockMarkets()),
      hasMore: false,
      source: "mock",
    };
  }
}

export async function fetchAllMarkets(
  searchQuery = "",
  options?: { batchSize?: number; maxPages?: number; maxMarkets?: number },
): Promise<{ markets: Market[]; source: "polymarket" | "mock" }> {
  const forceMock = process.env.POLYMARKET_MOCK_MODE === "true";
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const applySearch = (input: Market[]) =>
    normalizedSearch.length === 0
      ? input
      : input.filter((m) =>
          m.question.toLowerCase().includes(normalizedSearch),
        );

  if (forceMock) {
    return {
      markets: applySearch(getMockMarkets()),
      source: "mock",
    };
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 200, 1), 500);
  const maxPages = Math.max(options?.maxPages ?? 10, 1);
  const maxMarkets = Math.max(options?.maxMarkets ?? 1000, 1);

  try {
    const byId = new Map<string, Market>();

    for (let page = 0; page < maxPages && byId.size < maxMarkets; page += 1) {
      const offset = page * batchSize;
      const batch = await fetchGammaBatch({
        limit: batchSize,
        offset,
        searchQuery: normalizedSearch,
      });

      let added = 0;
      for (const market of batch) {
        if (!byId.has(market.id)) {
          byId.set(market.id, market);
          added += 1;
          if (byId.size >= maxMarkets) break;
        }
      }

      if (batch.length < batchSize) break;
      if (added === 0) break;
    }

    return { markets: Array.from(byId.values()), source: "polymarket" };
  } catch {
    return {
      markets: applySearch(getMockMarkets()),
      source: "mock",
    };
  }
}

export async function fetchMarkets(
  limit = 20,
  searchQuery = "",
): Promise<{ markets: Market[]; source: "polymarket" | "mock" }> {
  const forceMock = process.env.POLYMARKET_MOCK_MODE === "true";
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const applySearch = (input: Market[]) =>
    normalizedSearch.length === 0
      ? input
      : input.filter((m) =>
          m.question.toLowerCase().includes(normalizedSearch),
        );

  if (forceMock) {
    return {
      markets: applySearch(getMockMarkets()).slice(0, limit),
      source: "mock",
    };
  }

  try {
    const markets = applySearch(
      await fetchGammaBatch({
        limit,
        searchQuery: normalizedSearch,
      }),
    ).slice(0, limit);

    return { markets, source: "polymarket" };
  } catch {
    return {
      markets: applySearch(getMockMarkets()).slice(0, limit),
      source: "mock",
    };
  }
}
