import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { analyzeMarketsWithElizaChannel } from "@/lib/eliza";

const RequestSchema = z.object({
  markets: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        probability: z.number(),
        volume: z.number(),
        liquidity: z.number().default(0),
        endDate: z.string().optional(),
      }),
    )
    .min(1, "At least one market is required"),
});

/**
 * POST /api/analyze
 *
 * Accepts a markets payload from the browser and runs channel-based Eliza
 * analysis (get/create DM channel -> post prompt -> poll channel replies).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const signals = await analyzeMarketsWithElizaChannel(
      parsed.data.markets,
      req.signal,
    );
    return NextResponse.json({
      submitted: parsed.data.markets.length,
      generated: signals.length,
      status: "completed",
    });
  } catch {
    return NextResponse.json({
      submitted: parsed.data.markets.length,
      generated: 0,
      status: "mock",
    });
  }
}
