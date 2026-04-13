import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchKalshiMarkets } from "@/lib/jupiter";
import { buildMarketComparisons } from "@/lib/market-comparison";
import { fetchAllMarkets } from "@/lib/polymarket";
import type { MarketComparisonResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const thresholdParam = Number(
      req.nextUrl.searchParams.get("threshold") ?? "0.05",
    );

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
      : 20;
    const threshold = Number.isFinite(thresholdParam)
      ? Math.min(Math.max(thresholdParam, 0.01), 0.5)
      : 0.05;

    const [polyResult, kalshiResult] = await Promise.allSettled([
      fetchAllMarkets(q, { batchSize: 200, maxPages: 6, maxMarkets: 500 }),
      fetchKalshiMarkets({ query: q, limit: 250 }),
    ]);

    const polymarket =
      polyResult.status === "fulfilled" ? polyResult.value.markets : [];
    const source =
      polyResult.status === "fulfilled" ? polyResult.value.source : "mock";
    const kalshi =
      kalshiResult.status === "fulfilled" ? kalshiResult.value : [];

    const comparisons = buildMarketComparisons(polymarket, kalshi, {
      threshold,
      maxResults: limit * 4,
    });

    const opportunities = comparisons
      .filter((c) => c.thresholdHit)
      .slice(0, limit);

    const payload: MarketComparisonResponse = {
      opportunities,
      threshold,
      source: source === "mock" ? "mock" : "polymarket+jupiter-kalshi",
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to build cross-market comparison",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
