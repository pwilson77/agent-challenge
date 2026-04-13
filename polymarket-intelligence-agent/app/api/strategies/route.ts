import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_STRATEGY_NAME,
  ensureDefaultStrategy,
} from "@/lib/strategy-runner";
import type { AnalystPersona, Strategy } from "@/lib/types";

const PERSONAS: AnalystPersona[] = [
  "BALANCED",
  "CONTRARIAN",
  "QUANT",
  "NEWS_JUNKIE",
];

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      promptTemplate?: string;
      batchSize?: number;
      persona?: AnalystPersona;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { message: "name is required" },
        { status: 400 },
      );
    }
    if (!body.promptTemplate?.trim()) {
      return NextResponse.json(
        { message: "promptTemplate is required" },
        { status: 400 },
      );
    }

    const persona = PERSONAS.includes(body.persona ?? "BALANCED")
      ? (body.persona ?? "BALANCED")
      : "BALANCED";

    const strategy = await prisma.strategy.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        persona,
        promptTemplate: body.promptTemplate.trim(),
        batchSize: body.batchSize ?? 4,
      },
    });

    const payload: Strategy = {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      isDefault: false,
      persona: (strategy.persona as AnalystPersona | null) ?? "BALANCED",
      promptTemplate: strategy.promptTemplate,
      batchSize: strategy.batchSize,
      active: strategy.active,
      scheduleEnabled: strategy.scheduleEnabled,
      scheduleCron: strategy.scheduleCron,
      createdAt: strategy.createdAt.toISOString(),
      updatedAt: strategy.updatedAt.toISOString(),
    };

    return NextResponse.json({ strategy: payload }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to create strategy",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}

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
      persona: (s.persona as AnalystPersona | null) ?? "BALANCED",
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
