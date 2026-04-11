#!/bin/sh
set -eu

: "${ELIZA_SERVER_PORT:=3001}"
: "${PORT:=3000}"
: "${DATABASE_URL:=file:/app/data/polymarket.db}"
: "${ELIZA_AGENT_URL:=http://127.0.0.1:${ELIZA_SERVER_PORT}}"
: "${LLM_PROXY_PORT:=4000}"

export ELIZA_AGENT_URL

# ── LLM proxy setup ──────────────────────────────────────────────────────────
# Save the real Nosana endpoint so the proxy can reach it, then redirect
# Eliza to the proxy so we can fall back to OpenRouter on Nosana failures.
if [ -n "${OPENAI_BASE_URL:-}" ]; then
  export NOSANA_OPENAI_BASE_URL="$OPENAI_BASE_URL"
  export OPENAI_BASE_URL="http://127.0.0.1:${LLM_PROXY_PORT}/v1"
fi

cleanup() {
  if [ -n "${proxy_pid:-}" ] && kill -0 "$proxy_pid" 2>/dev/null; then
    kill "$proxy_pid" 2>/dev/null || true
  fi
  if [ -n "${agent_pid:-}" ] && kill -0 "$agent_pid" 2>/dev/null; then
    kill "$agent_pid" 2>/dev/null || true
  fi
  if [ -n "${next_pid:-}" ] && kill -0 "$next_pid" 2>/dev/null; then
    kill "$next_pid" 2>/dev/null || true
  fi
}

trap cleanup INT TERM

# Start LLM proxy (Nosana → OpenRouter fallback).
node /app/docker/llm-proxy.mjs &
proxy_pid=$!

# Start Eliza agent on an internal port for the Next.js app to consume.
cd /app/agent
SERVER_PORT="$ELIZA_SERVER_PORT" pnpm start &
agent_pid=$!

# Wait briefly for the agent to become reachable.
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS "http://127.0.0.1:${ELIZA_SERVER_PORT}/health" >/dev/null 2>&1 || \
     curl -fsS "http://127.0.0.1:${ELIZA_SERVER_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi

  if ! kill -0 "$agent_pid" 2>/dev/null; then
    wait "$agent_pid"
    exit $?
  fi

  i=$((i + 1))
  sleep 1
done

# Prepare DB and start Next.js dashboard.
cd /app/frontend
case "$DATABASE_URL" in
  file:*)
    db_path="${DATABASE_URL#file:}"
    mkdir -p "$(dirname "$db_path")"
    ;;
esac

npx prisma migrate deploy
npm run start -- --hostname 0.0.0.0 --port "$PORT" &
next_pid=$!

# Keep container alive while all processes are healthy.
while kill -0 "$proxy_pid" 2>/dev/null && kill -0 "$agent_pid" 2>/dev/null && kill -0 "$next_pid" 2>/dev/null; do
  sleep 2
done

if ! kill -0 "$proxy_pid" 2>/dev/null; then
  wait "$proxy_pid"
  status=$?
elif ! kill -0 "$agent_pid" 2>/dev/null; then
  wait "$agent_pid"
  status=$?
else
  wait "$next_pid"
  status=$?
fi

cleanup
exit "$status"
