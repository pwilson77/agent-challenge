import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── GET /api/simulations — list all sessions with aggregated data ─────────────

export async function GET() {
  try {
    const sessions = await prisma.simulationSession.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        positions: {
          where: { status: "open" },
          select: { id: true },
        },
      },
    });

    // For each session, grab the latest snapshot per open position to compute totalPnl
    const sessionIds = sessions.map((s) => s.id);
    const latestSnapshots = await prisma.simulationSnapshot.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { takenAt: "desc" },
      distinct: ["positionId"],
      select: { sessionId: true, positionId: true, pnl: true },
    });

    const pnlBySession: Record<string, number> = {};
    for (const snap of latestSnapshots) {
      pnlBySession[snap.sessionId] =
        (pnlBySession[snap.sessionId] ?? 0) + snap.pnl;
    }

    const result = sessions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      betSize: s.betSize,
      interval: s.interval,
      intervalMin: s.intervalMin,
      nextTickAt: null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      positionCount: s.positions.length,
      totalPnl: pnlBySession[s.id] ?? 0,
    }));

    return NextResponse.json({ sessions: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── POST /api/simulations — create a new session ─────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      betSize?: number;
      interval?: string;
      intervalMin?: number;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const betSize = Number(body.betSize ?? 100);
    if (!Number.isFinite(betSize) || betSize <= 0) {
      return NextResponse.json(
        { error: "betSize must be a positive number" },
        { status: 400 },
      );
    }

    const interval = (body.interval ?? "1h") as "1h" | "4h" | "1d" | "custom";
    if (!["1h", "4h", "1d", "custom"].includes(interval)) {
      return NextResponse.json(
        { error: "interval must be one of: 1h, 4h, 1d, custom" },
        { status: 400 },
      );
    }

    const intervalMin =
      interval === "custom"
        ? Math.max(1, Number(body.intervalMin ?? 60))
        : null;

    const session = await prisma.simulationSession.create({
      data: {
        name,
        betSize,
        interval,
        intervalMin,
        nextTickAt: null,
        status: "active",
      },
    });

    return NextResponse.json(
      {
        session: {
          ...session,
          nextTickAt: null,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
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
