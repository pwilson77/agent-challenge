import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface AgentStatus {
  eliza: boolean;
  nosana: "ok" | "down" | "unknown";
  openrouter: boolean;
}

export async function GET() {
  const elizaUrl = (
    process.env.ELIZA_AGENT_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");

  // Check Eliza agent process
  let eliza = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${elizaUrl}/healthz`, { signal: ctrl.signal });
    clearTimeout(timer);
    eliza = res.ok;
  } catch {
    eliza = false;
  }

  // Check Nosana inference endpoint (optional — only if env var is set)
  let nosana: AgentStatus["nosana"] = "unknown";
  const nosanaUrl = process.env.NOSANA_INFERENCE_URL?.replace(/\/$/, "");
  if (nosanaUrl) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${nosanaUrl}/models`, { signal: ctrl.signal });
      clearTimeout(timer);
      nosana = res.ok ? "ok" : "down";
    } catch {
      nosana = "down";
    }
  }

  const openrouter = Boolean(process.env.OPENROUTER_API_KEY);

  const body: AgentStatus = { eliza, nosana, openrouter };
  return NextResponse.json(body);
}
