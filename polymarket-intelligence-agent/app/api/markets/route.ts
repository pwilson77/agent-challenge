import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchMarkets, fetchSearchMarkets } from "@/lib/polymarket";
import { prisma } from "@/lib/prisma";
import type { MarketsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("q") ?? "";
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "24");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 24;
    const pageParam = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const page = Number.isFinite(pageParam)
      ? Math.max(Math.floor(pageParam), 1)
      : 1;
    const pageSizeParam = Number(
      req.nextUrl.searchParams.get("pageSize") ?? String(limit),
    );
    const pageSize = Number.isFinite(pageSizeParam)
      ? Math.min(Math.max(Math.floor(pageSizeParam), 1), 100)
      : limit;

    const hasSearch = search.trim().length > 0;
    const requested = Math.max(limit, page * pageSize);

    const searchResult = hasSearch
      ? await fetchSearchMarkets(search, {
          limitPerType: 60,
          maxPages: 8,
        })
      : null;

    const { markets, source: fetchSource } =
      searchResult ?? (await fetchMarkets(Math.min(requested, 100), search));

    const start = (page - 1) * pageSize;
    const pagedMarkets = markets.slice(start, start + pageSize);

    const stored = await prisma.$transaction(
      pagedMarkets.map((market) =>
        prisma.market.upsert({
          where: { id: market.id },
          update: {
            conditionId: market.conditionId ?? null,
            clobTokenId: market.clobTokenId ?? null,
            question: market.question,
            probability: market.probability,
            volume: market.volume,
            liquidity: market.liquidity,
            endDate: market.endDate ? new Date(market.endDate) : null,
          },
          create: {
            id: market.id,
            conditionId: market.conditionId ?? null,
            clobTokenId: market.clobTokenId ?? null,
            question: market.question,
            probability: market.probability,
            volume: market.volume,
            liquidity: market.liquidity,
            endDate: market.endDate ? new Date(market.endDate) : null,
          },
        }),
      ),
    );

    const total = markets.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasNextFromTotal = page < totalPages;
    const hasNextFromSearchResult = Boolean(
      hasSearch && searchResult?.hasMore && page >= totalPages,
    );

    const pagedById = new Map(pagedMarkets.map((m) => [m.id, m]));
    const responseMarkets = stored.map((market) => {
      const live = pagedById.get(market.id);
      return {
        id: market.id,
        conditionId: market.conditionId ?? undefined,
        clobTokenId: market.clobTokenId ?? undefined,
        outcomes: live?.outcomes,
        outcomePrices: live?.outcomePrices,
        outcomeTokenIds: live?.outcomeTokenIds,
        question: market.question,
        probability: market.probability,
        volume: market.volume,
        liquidity: market.liquidity,
        endDate: market.endDate?.toISOString(),
      };
    });

    const payload: MarketsResponse = {
      markets: responseMarkets,
      source: fetchSource,
      updatedAt: new Date().toISOString(),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: hasNextFromTotal || hasNextFromSearchResult,
        hasPrev: page > 1,
      },
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to fetch markets",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
