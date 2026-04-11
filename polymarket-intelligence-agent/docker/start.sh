#!/bin/sh
set -eu

: "${DATABASE_URL:=file:/app/data/polymarket.db}"
: "${PORT:=3000}"

case "$DATABASE_URL" in
  file:*)
    db_path="${DATABASE_URL#file:}"
    mkdir -p "$(dirname "$db_path")"
    ;;
esac

npx prisma migrate deploy

exec npm run start -- --hostname 0.0.0.0 --port "$PORT"