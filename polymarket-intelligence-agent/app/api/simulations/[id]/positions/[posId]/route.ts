import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── DELETE /api/simulations/[id]/positions/[posId] — close a position ────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; posId: string }> },
) {
  try {
    const { id: sessionId, posId } = await params;

    const position = await prisma.simulationPosition.findFirst({
      where: { id: posId, sessionId },
      include: {
        snapshots: {
          orderBy: { takenAt: "desc" },
          take: 1,
        },
      },
    });

    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 },
      );
    }

    if (position.status === "closed") {
      return NextResponse.json(
        { error: "Position is already closed" },
        { status: 400 },
      );
    }

    const latestSnap = position.snapshots[0];
    const realizedPnl = latestSnap?.pnl ?? 0;
    const closeProbability =
      latestSnap?.probability ?? position.entryProbability;

    const closed = await prisma.simulationPosition.update({
      where: { id: posId },
      data: {
        status: "closed",
        closedAt: new Date(),
        closeProbability,
        realizedPnl,
      },
    });

    return NextResponse.json({
      position: {
        ...closed,
        createdAt: closed.createdAt.toISOString(),
        closedAt: closed.closedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
