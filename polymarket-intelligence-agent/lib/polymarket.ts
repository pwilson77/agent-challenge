import axios from "axios";
import { z } from "zod";

import { clamp, hashString, randomFloat } from "@/lib/utils";
import type { Market } from "@/lib/types";

const POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com/markets";

const RawMarketSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
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

function normalizeMarket(raw: z.infer<typeof RawMarketSchema>): Market {
  const id = String(
    raw.id ?? hashString(raw.question ?? raw.title ?? crypto.randomUUID()),
  );
  const question = raw.question ?? raw.title ?? "Untitled market";

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
    const response = await axios.get<unknown>(POLYMARKET_GAMMA_URL, {
      params: {
        active: true,
        closed: false,
        archived: false,
        limit,
        search: normalizedSearch || undefined,
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

    const markets = applySearch(
      parsed.data
        .map(normalizeMarket)
        .filter((market) => market.question.length > 0),
    ).slice(0, limit);

    return { markets, source: "polymarket" };
  } catch {
    return {
      markets: applySearch(getMockMarkets()).slice(0, limit),
      source: "mock",
    };
  }
}
