import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STRATEGY_NAME } from "@/lib/strategy-runner";
import type { AnalystPersona, Strategy } from "@/lib/types";

const PERSONAS: AnalystPersona[] = [
  "BALANCED",
  "CONTRARIAN",
  "QUANT",
  "NEWS_JUNKIE",
];

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      promptTemplate?: string;
      batchSize?: number;
      persona?: AnalystPersona;
    };

    const existing = await prisma.strategy.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { message: "Strategy not found" },
        { status: 404 },
      );
    }

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { message: "name cannot be empty" },
        { status: 400 },
      );
    }
    if (body.promptTemplate !== undefined && !body.promptTemplate.trim()) {
      return NextResponse.json(
        { message: "promptTemplate cannot be empty" },
        { status: 400 },
      );
    }

    if (
      body.persona !== undefined &&
      !PERSONAS.includes(body.persona as AnalystPersona)
    ) {
      return NextResponse.json(
        { message: "persona is invalid" },
        { status: 400 },
      );
    }

    const updated = await prisma.strategy.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && {
          description: body.description.trim() || null,
        }),
        ...(body.promptTemplate !== undefined && {
          promptTemplate: body.promptTemplate.trim(),
        }),
        ...(body.batchSize !== undefined && { batchSize: body.batchSize }),
        ...(body.persona !== undefined && { persona: body.persona }),
      },
    });

    const payload: Strategy = {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      isDefault: updated.name === DEFAULT_STRATEGY_NAME,
      persona: (updated.persona as AnalystPersona | null) ?? "BALANCED",
      promptTemplate: updated.promptTemplate,
      batchSize: updated.batchSize,
      active: updated.active,
      scheduleEnabled: updated.scheduleEnabled,
      scheduleCron: updated.scheduleCron,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ strategy: payload }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to update strategy",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
