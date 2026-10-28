#!/usr/bin/env bash
# Deploys the web app on the server (called by .github/workflows/deploy.yml over SSH, or by hand).
#   APP_ENV=staging bash scripts/deploy.sh <git-sha-or-ref>
# Steps: fetch → checkout → npm ci → build (into .next-build) → swap → pm2 reload → health check → roll back on failure.
# Building into a side directory keeps the running site serving while the new build compiles.
set -euo pipefail

REF="${1:-origin/v2}"
APP_ENV="${APP_ENV:-production}"
cd "$(dirname "$0")/.."
PORT="$(sed -nE 's/^PORT=([0-9]+).*/\1/p' .env 2>/dev/null | tail -1)"
PORT="${PORT:-3000}"
PREV="$(git rev-parse HEAD 2>/dev/null || echo '')"

build() {
  npm ci --no-audit --no-fund
  rm -rf .next-build
  NEXT_DIST_DIR=.next-build npm run build
  rm -rf .next-prev
  if [ -d .next ]; then mv .next .next-prev; fi
  mv .next-build .next
}

reload() {
  PORT="$PORT" APP_ENV="$APP_ENV" pm2 startOrReload ecosystem.config.cjs --update-env
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/robots.txt"; then return 0; fi
    sleep 2
  done
  return 1
}

echo "→ Deploying web ($APP_ENV) at $REF"
git fetch --all --prune --quiet
git checkout --force --quiet "$REF"
build
reload

if healthy; then
  echo "✓ Healthy on :$PORT ($(git rev-parse --short HEAD))"
  pm2 save >/dev/null
  exit 0
fi

echo "✗ Health check failed on :$PORT"
if [ -n "$PREV" ] && [ -d .next-prev ]; then
  echo "↩ Rolling back to $PREV"
  git checkout --force --quiet "$PREV"
  rm -rf .next && mv .next-prev .next
  npm ci --no-audit --no-fund
  reload || true
fi
exit 1
