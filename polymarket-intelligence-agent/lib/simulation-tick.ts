/**
 * Core paper-trading simulation logic.
 * Handles opening positions and ticking sessions to produce PnL snapshots.
 */

import { prisma } from "@/lib/prisma";
import { getClobLastTradePrice } from "@/lib/clob";

// ── Interval helpers ──────────────────────────────────────────────────────────

export function intervalToMs(
  interval: string,
  intervalMin?: number | null,
): number {
  switch (interval) {
    case "1h":
      return 60 * 60 * 1000;
    case "4h":
      return 4 * 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "custom":
      return Math.max(1, intervalMin ?? 60) * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}

export function intervalToCron(
  interval: string,
  intervalMin?: number | null,
): string {
  switch (interval) {
    case "1h":
      return "0 * * * *";
    case "4h":
      return "0 */4 * * *";
    case "1d":
      return "0 9 * * *";
    case "custom": {
      const min = Math.max(1, Math.min(intervalMin ?? 60, 1440));
      if (min < 60) return `*/${min} * * * *`;
      const hrs = Math.floor(min / 60);
      return `0 */${hrs} * * *`;
    }
    default:
      return "0 * * * *";
  }
}

// ── Open a new position ───────────────────────────────────────────────────────

export async function openPosition(opts: {
  sessionId: string;
  marketId: string;
  clobTokenId?: string | null;
  marketQuestion: string;
  action: "BUY" | "SELL";
  betSize: number;
  currentProbability: number;
}) {
  const {
    sessionId,
    marketId,
    clobTokenId,
    marketQuestion,
    action,
    betSize,
    currentProbability,
  } = opts;

  if (currentProbability <= 0 || currentProbability >= 1) {
    throw new Error("currentProbability must be between 0 and 1 (exclusive)");
  }

  const shares =
    action === "BUY"
      ? betSize / currentProbability
      : betSize / (1 - currentProbability);

  const position = await prisma.simulationPosition.create({
    data: {
      sessionId,
      marketId,
      clobTokenId,
      marketQuestion,
      action,
      betSize,
      entryProbability: currentProbability,
      shares,
      status: "open",
    },
  });

  // First snapshot — PnL = 0 at entry
  await prisma.simulationSnapshot.create({
    data: {
      sessionId,
      positionId: position.id,
      probability: currentProbability,
      value: betSize,
      pnl: 0,
    },
  });

  return position;
}

// ── Tick a session ────────────────────────────────────────────────────────────

export interface TickResult {
  sessionId: string;
  positionsProcessed: number;
  totalPnl: number;
  positionResults: Array<{
    positionId: string;
    marketQuestion: string;
    action: string;
    probability: number;
    value: number;
    pnl: number;
  }>;
}

export async function tickSession(sessionId: string): Promise<TickResult> {
  const session = await prisma.simulationSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { positions: { where: { status: "open" } } },
  });

  if (session.positions.length === 0) {
    return {
      sessionId,
      positionsProcessed: 0,
      totalPnl: 0,
      positionResults: [],
    };
  }

  const marketIds = [...new Set(session.positions.map((p) => p.marketId))];
  const dbMarkets = await prisma.market.findMany({
    where: { id: { in: marketIds } },
    select: { id: true, probability: true, clobTokenId: true },
  });
  const dbMarketMap = Object.fromEntries(dbMarkets.map((m) => [m.id, m]));

  const now = new Date();
  const snapshotData: Array<{
    sessionId: string;
    positionId: string;
    probability: number;
    value: number;
    pnl: number;
    takenAt: Date;
  }> = [];
  const positionResults: TickResult["positionResults"] = [];

  for (const pos of session.positions) {
    const tokenId =
      pos.clobTokenId ?? dbMarketMap[pos.marketId]?.clobTokenId ?? null;
    let prob = dbMarketMap[pos.marketId]?.probability ?? pos.entryProbability;
    if (tokenId) {
      try {
        prob = await getClobLastTradePrice(tokenId);
      } catch {
        // fall back to stored market probability / entry probability
      }
    }
    const value =
      pos.action === "BUY" ? pos.shares * prob : pos.shares * (1 - prob);
    const pnl = value - pos.betSize;

    snapshotData.push({
      sessionId,
      positionId: pos.id,
      probability: prob,
      value,
      pnl,
      takenAt: now,
    });

    positionResults.push({
      positionId: pos.id,
      marketQuestion: pos.marketQuestion,
      action: pos.action,
      probability: prob,
      value,
      pnl,
    });
  }

  await prisma.simulationSnapshot.createMany({ data: snapshotData });

  const totalPnl = positionResults.reduce((sum, r) => sum + r.pnl, 0);
  return {
    sessionId,
    positionsProcessed: session.positions.length,
    totalPnl,
    positionResults,
  };
}
