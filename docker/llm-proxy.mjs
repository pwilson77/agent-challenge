#!/usr/bin/env node
/**
 * llm-proxy.mjs
 *
 * Tiny OpenAI-compatible reverse proxy.
 * Eliza points OPENAI_BASE_URL at this proxy (port 4000).
 * Requests are forwarded to the real Nosana inference endpoint;
 * on 5xx or network error the proxy retries via OpenRouter.
 *
 * Env vars (set by start-combined.sh):
 *   NOSANA_OPENAI_BASE_URL      The original Nosana /v1 endpoint URL
 *   OPENROUTER_API_KEY          OpenRouter API key (enables fallback)
 *   OPENROUTER_FALLBACK_MODEL   e.g. "anthropic/claude-3-haiku" (default)
 *   LLM_PROXY_PORT              Proxy listen port (default: 4000)
 */

import http from "node:http";
import fs from "node:fs";

const PORT = parseInt(process.env.LLM_PROXY_PORT ?? "4000", 10);
const NOSANA_BASE = (process.env.NOSANA_OPENAI_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
const OR_KEY =
  process.env.OPENROUTER_API_KEY ??
  (fs.existsSync("/app/.openrouter_key")
    ? fs.readFileSync("/app/.openrouter_key", "utf8").trim()
    : "");
const OR_BASE = "https://openrouter.ai/api/v1";
const OR_MODEL =
  process.env.OPENROUTER_FALLBACK_MODEL ?? "anthropic/claude-3-haiku";

if (!NOSANA_BASE) {
  console.error("[llm-proxy] NOSANA_OPENAI_BASE_URL is required");
  process.exit(1);
}

/** POST JSON body to a URL, with a hard timeout. */
async function forward(url, body, extraHeaders, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** Pipe a Fetch API Response into a Node.js ServerResponse. */
async function pipeResponse(fetchRes, nodeRes) {
  nodeRes.writeHead(fetchRes.status, {
    "content-type": fetchRes.headers.get("content-type") ?? "application/json",
  });
  if (fetchRes.body) {
    for await (const chunk of fetchRes.body) {
      if (!nodeRes.writableEnded) nodeRes.write(chunk);
    }
  }
  nodeRes.end();
}

function sendError(res, status, message) {
  if (!res.headersSent) {
    res.writeHead(status, { "content-type": "application/json" });
  }
  if (!res.writableEnded) {
    res.end(JSON.stringify({ error: { message, type: "proxy_error" } }));
  }
}

http
  .createServer(async (req, res) => {
    // Collect request body.
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();

    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const path = req.url ?? "/";
    const isCompletion =
      path.endsWith("/chat/completions") || path.endsWith("/completions");

    // ── Non-completion paths (e.g. /v1/models) ───────────────────────────
    if (!isCompletion) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5_000);
        const upRes = await fetch(`${NOSANA_BASE}${path}`, {
          method: req.method,
          headers: {
            authorization: req.headers.authorization ?? "Bearer nosana",
          },
          signal: ctrl.signal,
        }).finally(() => clearTimeout(t));
        const text = await upRes.text();
        res.writeHead(upRes.status, { "content-type": "application/json" });
        res.end(text);
      } catch {
        // Nosana unreachable — return a stub model list so Eliza can boot.
        const stub = {
          object: "list",
          data: [{ id: OR_MODEL || "unknown", object: "model" }],
        };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(stub));
      }
      return;
    }

    // ── Completion path: try Nosana first ─────────────────────────────────
    let nosanaFailed = false;
    try {
      const nosanaRes = await forward(`${NOSANA_BASE}${path}`, body, {
        authorization: req.headers.authorization ?? "Bearer nosana",
      });

      if (nosanaRes.ok) {
        await pipeResponse(nosanaRes, res);
        return;
      }

      // 4xx → client error; return as-is (don't burn OpenRouter quota).
      if (nosanaRes.status >= 400 && nosanaRes.status < 500) {
        await pipeResponse(nosanaRes, res);
        return;
      }

      // 5xx → fall through to OpenRouter.
      console.warn(
        `[llm-proxy] Nosana returned ${nosanaRes.status} — trying OpenRouter fallback`,
      );
      nosanaFailed = true;
    } catch (err) {
      console.warn(
        "[llm-proxy] Nosana network error:",
        err.message,
        "— trying OpenRouter fallback",
      );
      nosanaFailed = true;
    }

    if (!nosanaFailed) return;

    if (!OR_KEY) {
      sendError(
        res,
        503,
        "Nosana is unavailable and OPENROUTER_API_KEY is not configured",
      );
      return;
    }

    // ── OpenRouter fallback ───────────────────────────────────────────────
    try {
      const orBody = { ...body, model: OR_MODEL };
      const orRes = await forward(`${OR_BASE}/chat/completions`, orBody, {
        authorization: `Bearer ${OR_KEY}`,
        "http-referer": "https://github.com/pwilson77/agent-challenge",
        "x-title": "Nosana Eliza Agent",
      });
      await pipeResponse(orRes, res);
    } catch (err) {
      sendError(res, 500, `Both Nosana and OpenRouter failed: ${err.message}`);
    }
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(
      `[llm-proxy] :${PORT} → ${NOSANA_BASE}  OR fallback: ${OR_KEY ? "enabled" : "disabled (set OPENROUTER_API_KEY)"}`,
    );
  });
