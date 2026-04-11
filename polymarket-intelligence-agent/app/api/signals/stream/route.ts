import type { NextRequest } from "next/server";

import {
  analyzeMarketsWithElizaChannelBatched,
  buildMockSignal,
} from "@/lib/eliza";
import { fetchMarkets } from "@/lib/polymarket";
import type { Market } from "@/lib/types";
import { sleep } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/signals/stream
 *
 * Server-Sent Events endpoint that implements the full Eliza integration flow:
 *   1. Fetch live Polymarket markets
 *   2. POST market data to the ElizaOS agent REST endpoint
 *   3. Subscribe to Eliza's pub/sub SSE channel and proxy each Signal back to the client
 *
 * If Eliza is unreachable the route falls back to deterministic mock signals so
 * the UI is never left in a broken / empty state.
 *
 * Event types emitted:
 *   event: markets   – initial market list fetched from Polymarket
 *   event: status    – progress/error messages from the analysis pipeline
 *   event: signal    – individual AI signal as it arrives from Eliza
 *   event: done      – stream is complete; client can safely close the EventSource
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const ac = new AbortController();

  // Propagate client disconnect to the internal Eliza fetch
  req.signal.addEventListener("abort", () => ac.abort(), { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      /**
       * Encode and enqueue a named SSE event.
       * Named events allow the client to use addEventListener("signal", …) instead
       * of the generic onmessage handler.
       */
      function send(event: string, data: unknown) {
        if (controller.desiredSize === null) return; // stream already closed
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // controller was closed concurrently – ignore
        }
      }

      // ------------------------------------------------------------------
      // Step 1: Fetch Polymarket markets and emit them immediately so the
      //         market table populates while Eliza is still thinking.
      // ------------------------------------------------------------------
      let markets: Market[] = [];
      try {
        const result = await fetchMarkets(12);
        markets = result.markets;
        send("markets", { markets, source: result.source });
      } catch {
        send("error", { message: "Failed to fetch Polymarket data" });
        controller.close();
        return;
      }

      // ------------------------------------------------------------------
      // Step 2: Open/find DM channel, post analysis prompt, poll channel replies
      // ------------------------------------------------------------------
      const forceMock = process.env.POLYMARKET_MOCK_MODE === "true";
      let useEliza = !forceMock;

      if (useEliza) {
        try {
          const batchSizeEnv = Number(
            process.env.ELIZA_ANALYSIS_BATCH_SIZE ?? "4",
          );
          const batchSize = Number.isFinite(batchSizeEnv)
            ? Math.min(Math.max(Math.floor(batchSizeEnv), 1), 12)
            : 4;

          send("status", {
            status: "analyzing",
            message: `Starting batched analysis (${Math.ceil(markets.length / batchSize)} batches).`,
          });

          const signals = await analyzeMarketsWithElizaChannelBatched(markets, {
            batchSize,
            abortSignal: ac.signal,
            onBatchComplete: (batchSignals, batchIndex, totalBatches) => {
              send("status", {
                status: "analyzing",
                message: `Batch ${batchIndex + 1}/${totalBatches} completed (${batchSignals.length} signals).`,
              });

              for (const signal of batchSignals) {
                if (ac.signal.aborted) break;
                send("signal", signal);
              }
            },
          });

          send("status", {
            status: "analyzing",
            message: `Received ${signals.length} signals from Eliza channel`,
          });

          send("done", { complete: true });
          controller.close();
          return;
        } catch {
          useEliza = false;
          send("status", {
            status: "mock",
            message: "Eliza agent unavailable – using mock signals",
          });
        }
      }

      // ------------------------------------------------------------------
      // Fallback: emit deterministic mock signals with a small delay between
      //           each one so the UI receives them in a convincing live stream
      // ------------------------------------------------------------------
      for (const market of markets) {
        if (ac.signal.aborted) break;
        send("signal", buildMockSignal(market));
        await sleep(280);
      }

      send("done", { complete: true });
      controller.close();
    },

    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // disable Nginx/proxy buffering
      Connection: "keep-alive",
    },
  });
}
