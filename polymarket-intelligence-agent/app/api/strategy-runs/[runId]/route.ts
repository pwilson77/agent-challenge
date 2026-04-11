import { NextRequest, NextResponse } from "next/server";

import { getStrategyRun } from "@/lib/strategy-runner";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const run = await getStrategyRun(runId);

    if (!run) {
      return NextResponse.json({ message: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({ run }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to fetch strategy run",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
