import { analyzeMarketsWithElizaChannelBatched } from "@/lib/eliza";
import { prisma } from "@/lib/prisma";
import type { StrategyRun } from "@/lib/types";

export const DEFAULT_STRATEGY_NAME = "Default Strategy";

function toRunDto(run: {
  id: string;
  strategyId: string;
  strategy: { name: string };
  status: string;
  batchSize: number;
  selectedCount: number;
  signalCount: number;
  batchesCompleted: number;
  errorMsg: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  runtimeMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}): StrategyRun {
  return {
    id: run.id,
    strategyId: run.strategyId,
    strategyName: run.strategy.name,
    status: run.status as StrategyRun["status"],
    batchSize: run.batchSize,
    selectedCount: run.selectedCount,
    signalCount: run.signalCount,
    batchesCompleted: run.batchesCompleted,
    errorMsg: run.errorMsg,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    runtimeMs: run.runtimeMs,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export async function ensureDefaultStrategy() {
  return prisma.strategy.upsert({
    where: { name: DEFAULT_STRATEGY_NAME },
    update: {
      active: true,
      batchSize: 4,
      description: "Baseline strategy using Eliza market analysis prompt",
      promptTemplate:
        "Analyze each market and return JSON signals with confidence, reasoning, and action.",
    },
    create: {
      name: DEFAULT_STRATEGY_NAME,
      active: true,
      batchSize: 4,
      scheduleEnabled: false,
      description: "Baseline strategy using Eliza market analysis prompt",
      promptTemplate:
        "Analyze each market and return JSON signals with confidence, reasoning, and action.",
    },
  });
}

export async function runStrategyOnMarkets(params: {
  strategyId: string;
  marketIds: string[];
  abortSignal?: AbortSignal;
}): Promise<StrategyRun> {
  const { strategyId, marketIds, abortSignal } = params;
  const uniqueMarketIds = Array.from(new Set(marketIds));
  if (uniqueMarketIds.length === 0) {
    throw new Error("At least one market must be selected");
  }

  const strategy = await prisma.strategy.findUnique({
    where: { id: strategyId },
  });
  if (!strategy || !strategy.active) {
    throw new Error("Strategy not found or inactive");
  }

  const selectedMarkets = await prisma.market.findMany({
    where: { id: { in: uniqueMarketIds } },
    orderBy: { createdAt: "desc" },
  });

  if (selectedMarkets.length === 0) {
    throw new Error("Selected markets were not found in DB");
  }

  const run = await prisma.strategyRun.create({
    data: {
      strategyId: strategy.id,
      status: "running",
      batchSize: strategy.batchSize,
      selectedCount: selectedMarkets.length,
      startedAt: new Date(),
    },
    include: { strategy: { select: { name: true } } },
  });

  const started = Date.now();
  let persistedSignals = 0;

  try {
    await analyzeMarketsWithElizaChannelBatched(
      selectedMarkets.map((m) => ({
        id: m.id,
        question: m.question,
        probability: m.probability,
        volume: m.volume,
        liquidity: m.liquidity,
        endDate: m.endDate?.toISOString(),
      })),
      {
        batchSize: strategy.batchSize,
        abortSignal,
        strategyPrompt: strategy.promptTemplate,
        onBatchComplete: async (batchSignals, batchIndex) => {
          await prisma.$transaction(
            batchSignals.map((signal) => {
              const market = selectedMarkets.find(
                (m) => m.question === signal.market,
              );
              if (!market) {
                return prisma.strategyRun.update({
                  where: { id: run.id },
                  data: { batchesCompleted: batchIndex + 1 },
                });
              }

              return prisma.signal.create({
                data: {
                  marketId: market.id,
                  runId: run.id,
                  signalType: signal.signal,
                  confidence: signal.confidence,
                  reasoning: signal.reasoning,
                  action: signal.action,
                },
              });
            }),
          );

          persistedSignals += batchSignals.length;
          await prisma.strategyRun.update({
            where: { id: run.id },
            data: {
              batchesCompleted: batchIndex + 1,
              signalCount: persistedSignals,
            },
          });
        },
      },
    );

    const updated = await prisma.strategyRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        runtimeMs: Date.now() - started,
        signalCount: persistedSignals,
      },
      include: { strategy: { select: { name: true } } },
    });

    return toRunDto(updated);
  } catch (error) {
    const updated = await prisma.strategyRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        runtimeMs: Date.now() - started,
        errorMsg:
          error instanceof Error
            ? error.message
            : "Unknown strategy run failure",
      },
      include: { strategy: { select: { name: true } } },
    });

    return toRunDto(updated);
  }
}

export async function listStrategyRuns(limit = 20): Promise<StrategyRun[]> {
  const rows = await prisma.strategyRun.findMany({
    take: Math.min(Math.max(limit, 1), 100),
    orderBy: { createdAt: "desc" },
    include: { strategy: { select: { name: true } } },
  });

  return rows.map(toRunDto);
}

export async function getStrategyRun(runId: string) {
  const run = await prisma.strategyRun.findUnique({
    where: { id: runId },
    include: {
      strategy: { select: { name: true } },
      signals: {
        include: { market: { select: { id: true, question: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!run) return null;

  return {
    ...toRunDto(run),
    signals: run.signals.map((s) => ({
      id: s.id,
      marketId: s.market.id,
      marketQuestion: s.market.question,
      signalType: s.signalType as
        | "MISPRICED"
        | "MOMENTUM"
        | "ARBITRAGE"
        | "BREAKING_NEWS",
      confidence: s.confidence,
      reasoning: s.reasoning,
      action: s.action as "BUY" | "SELL" | "MONITOR",
      createdAt: s.createdAt.toISOString(),
    })),
  };
}
