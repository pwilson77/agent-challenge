import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureDefaultStrategy,
  listStrategyRuns,
  runStrategyOnMarkets,
} from "@/lib/strategy-runner";

export const dynamic = "force-dynamic";

const CreateRunSchema = z.object({
  strategyId: z.string().min(1),
  marketIds: z.array(z.string().min(1)).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitParam) ? limitParam : 20;
    const runs = await listStrategyRuns(limit);
    return NextResponse.json({ runs }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to list strategy runs",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}

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

  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await ensureDefaultStrategy();
    const run = await runStrategyOnMarkets({
      strategyId: parsed.data.strategyId,
      marketIds: parsed.data.marketIds,
      abortSignal: req.signal,
    });

    return NextResponse.json({ run }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to execute strategy run",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
