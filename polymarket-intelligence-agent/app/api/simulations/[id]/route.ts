import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET /api/simulations/[id] — full detail ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await prisma.simulationSession.findUnique({
      where: { id },
      include: {
        positions: {
          orderBy: { createdAt: "asc" },
          include: {
            snapshots: {
              orderBy: { takenAt: "desc" },
              take: 1, // Latest snapshot for current PnL
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch last 30 snapshots across all positions for history table
    const history = await prisma.simulationSnapshot.findMany({
      where: { sessionId: id },
      orderBy: { takenAt: "desc" },
      take: 30,
      select: {
        id: true,
        positionId: true,
        sessionId: true,
        probability: true,
        value: true,
        pnl: true,
        takenAt: true,
        position: {
          select: { marketQuestion: true, action: true, marketId: true },
        },
      },
    });

    const positions = session.positions.map((pos) => {
      const latest = pos.snapshots[0];
      return {
        id: pos.id,
        sessionId: pos.sessionId,
        marketId: pos.marketId,
        marketQuestion: pos.marketQuestion,
        action: pos.action,
        betSize: pos.betSize,
        entryProbability: pos.entryProbability,
        shares: pos.shares,
        status: pos.status,
        closedAt: pos.closedAt?.toISOString() ?? null,
        closeProbability: pos.closeProbability ?? null,
        realizedPnl: pos.realizedPnl ?? null,
        createdAt: pos.createdAt.toISOString(),
        currentProbability: latest?.probability ?? pos.entryProbability,
        openPnl: latest?.pnl ?? 0,
      };
    });

    return NextResponse.json({
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        betSize: session.betSize,
        interval: session.interval,
        intervalMin: session.intervalMin,
        nextTickAt: null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        positions,
        totalPnl: positions.reduce((sum, p) => sum + (p.openPnl ?? 0), 0),
        history: history.map((s) => ({
          id: s.id,
          positionId: s.positionId,
          sessionId: s.sessionId,
          marketId: s.position.marketId,
          marketQuestion: s.position.marketQuestion,
          action: s.position.action,
          probability: s.probability,
          value: s.value,
          pnl: s.pnl,
          takenAt: s.takenAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── PATCH /api/simulations/[id] — update status ───────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { status?: string };

    const status = body.status;
    if (!status || !["active", "paused", "stopped"].includes(status)) {
      return NextResponse.json(
        { error: "status must be one of: active, paused, stopped" },
        { status: 400 },
      );
    }

    const existing = await prisma.simulationSession.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const session = await prisma.simulationSession.update({
      where: { id },
      data: { status, nextTickAt: null },
    });

    return NextResponse.json({
      session: {
        ...session,
        nextTickAt: null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── DELETE /api/simulations/[id] — delete session and related records ───────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.simulationSession.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.simulationSnapshot.deleteMany({ where: { sessionId: id } });
      await tx.simulationPosition.deleteMany({ where: { sessionId: id } });
      await tx.simulationSession.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
