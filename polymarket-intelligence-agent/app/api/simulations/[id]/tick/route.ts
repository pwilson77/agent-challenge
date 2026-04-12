import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { tickSession } from "@/lib/simulation-tick";

export const dynamic = "force-dynamic";

// ── POST /api/simulations/[id]/tick — manually trigger a tick ─────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await tickSession(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
