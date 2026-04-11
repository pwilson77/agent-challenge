#!/bin/sh
set -eu

: "${ELIZA_SERVER_PORT:=3001}"
: "${PORT:=3000}"
: "${DATABASE_URL:=file:/app/data/polymarket.db}"
: "${ELIZA_AGENT_URL:=http://127.0.0.1:${ELIZA_SERVER_PORT}}"

export ELIZA_AGENT_URL

cleanup() {
  if [ -n "${agent_pid:-}" ] && kill -0 "$agent_pid" 2>/dev/null; then
    kill "$agent_pid" 2>/dev/null || true
  fi
  if [ -n "${next_pid:-}" ] && kill -0 "$next_pid" 2>/dev/null; then
    kill "$next_pid" 2>/dev/null || true
  fi
}

trap cleanup INT TERM

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

# Keep container alive while both processes are healthy.
while kill -0 "$agent_pid" 2>/dev/null && kill -0 "$next_pid" 2>/dev/null; do
  sleep 2
done

if ! kill -0 "$agent_pid" 2>/dev/null; then
  wait "$agent_pid"
  status=$?
else
  wait "$next_pid"
  status=$?
fi

cleanup
exit "$status"
