#!/usr/bin/env bash
set -euo pipefail

# Safe local launcher for Eliza 1.7.x.
# If startup fails with the known PGlite migration/schema issue,
# clear the local PGlite data dir and retry once.

CHARACTER_PATH="./characters/agent.character.json"
DB_DIR="${PGLITE_DATA_DIR:-./.eliza/.elizadb}"
TMP_LOG="$(mktemp)"

cleanup() {
  rm -f "$TMP_LOG"
}

trap cleanup EXIT

mkdir -p "$DB_DIR"
export PGLITE_DATA_DIR="$DB_DIR"

run_start() {
  bunx elizaos start --character "$CHARACTER_PATH" 2>&1 | tee "$TMP_LOG"
  return ${PIPESTATUS[0]}
}

if run_start; then
  exit 0
fi

if grep -q "CREATE SCHEMA IF NOT EXISTS migrations" "$TMP_LOG"; then
  echo "[start-safe] Detected PGlite migration schema failure; resetting $DB_DIR and retrying once..."
  rm -rf "$DB_DIR"
  mkdir -p "$DB_DIR"
  exec bunx elizaos start --character "$CHARACTER_PATH"
fi

exit 1