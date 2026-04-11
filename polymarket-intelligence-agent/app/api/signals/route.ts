import { NextResponse } from "next/server";

import { analyzeMarket } from "@/lib/eliza";
import { fetchMarkets } from "@/lib/polymarket";
import type { Signal, SignalsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { markets } = await fetchMarkets(12);

    const signalResults = await Promise.allSettled(markets.map((market) => analyzeMarket(market)));

    const signals: Signal[] = signalResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const payload: SignalsResponse = {
      signals,
      source: "eliza",
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to generate signals",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
