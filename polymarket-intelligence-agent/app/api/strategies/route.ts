import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_STRATEGY_NAME,
  ensureDefaultStrategy,
} from "@/lib/strategy-runner";
import type { Strategy } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const defaultStrategy = await ensureDefaultStrategy();
    const strategies = await prisma.strategy.findMany({
      where: { active: true },
      orderBy: [{ createdAt: "asc" }],
    });

    const orderedStrategies = [
      defaultStrategy,
      ...strategies.filter((strategy) => strategy.id !== defaultStrategy.id),
    ];

    const payload: Strategy[] = orderedStrategies.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      isDefault: s.name === DEFAULT_STRATEGY_NAME,
      promptTemplate: s.promptTemplate,
      batchSize: s.batchSize,
      active: s.active,
      scheduleEnabled: s.scheduleEnabled,
      scheduleCron: s.scheduleCron,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return NextResponse.json({ strategies: payload }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to load strategies",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
