import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { openPosition } from "@/lib/simulation-tick";

export const dynamic = "force-dynamic";

// ── POST /api/simulations/[id]/positions — add a position to a session ────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await params;
    const body = (await req.json()) as {
      marketId?: string;
      clobTokenId?: string;
      marketQuestion?: string;
      action?: string;
      betSize?: number;
      currentProbability?: number;
    };

    const marketId = (body.marketId ?? "").trim();
    const clobTokenId = (body.clobTokenId ?? "").trim() || null;
    const marketQuestion = (body.marketQuestion ?? "").trim();
    if (!marketId || !marketQuestion) {
      return NextResponse.json(
        { error: "marketId and marketQuestion are required" },
        { status: 400 },
      );
    }

    const action = body.action;
    if (action !== "BUY" && action !== "SELL") {
      return NextResponse.json(
        { error: "action must be BUY or SELL" },
        { status: 400 },
      );
    }

    const currentProbability = Number(body.currentProbability);
    if (
      !Number.isFinite(currentProbability) ||
      currentProbability <= 0 ||
      currentProbability >= 1
    ) {
      return NextResponse.json(
        {
          error:
            "currentProbability must be a number between 0 and 1 (exclusive)",
        },
        { status: 400 },
      );
    }

    const betSize = Number(body.betSize);
    if (!Number.isFinite(betSize) || betSize <= 0) {
      return NextResponse.json(
        { error: "betSize must be a positive number" },
        { status: 400 },
      );
    }

    const position = await openPosition({
      sessionId,
      marketId,
      clobTokenId,
      marketQuestion,
      action,
      betSize,
      currentProbability,
    });

    return NextResponse.json(
      {
        position: {
          ...position,
          clobTokenId: position.clobTokenId,
          createdAt: position.createdAt.toISOString(),
          closedAt: position.closedAt?.toISOString() ?? null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
