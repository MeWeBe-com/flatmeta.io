#!/usr/bin/env bash
# Deploys FlatMeta on the server. Run by the CI deploy job over SSH (the server key uses a forced command,
# so this script takes everything it needs from the repo, .env and defaults), or by hand:
#   bash scripts/deploy.sh [branch]        # default: v2
# Steps: update code → install → build (web into a side directory) → migrate → swap → PM2 reload →
# health checks on $PORT (API) and $WEB_PORT (web) → roll back to the previous commit if they fail.
# Runs as the app's own Linux user: Node 22 comes from nvm, PM2 is the user's own. No root needed.
set -euo pipefail

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CI=1
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="${1:-${DEPLOY_BRANCH:-v2}}"

# Node 22 via nvm (non-interactive SSH sessions don't load the user's profile).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null
fi
command -v node >/dev/null || { echo "✗ node not found (install nvm and Node 22 for this user)"; exit 1; }
command -v pm2 >/dev/null || { echo "✗ pm2 not found (npm install -g pm2)"; exit 1; }

# Load .env safely (spaces, quotes and inline comments are fine).
[ -f .env ] || { echo "✗ $ROOT/.env is missing. Copy .env.example and fill it in."; exit 1; }
eval "$(node scripts/print-env.mjs)"
PORT="${PORT:-3201}"
WEB_PORT="${WEB_PORT:-3200}"
APP_ENV="${APP_ENV:-production}"

PREV="$(git rev-parse HEAD 2>/dev/null || echo '')"

# .env usually sets NODE_ENV=production, which makes npm skip devDependencies. The build needs them
# (tsc for the shared package's postinstall and the API, tsx for migrations and seeds), so always
# install them. NPM_CONFIG_INCLUDE=dev covers any nested npm call too.
export NPM_CONFIG_INCLUDE=dev
install_deps() { npm ci --include=dev --no-audit --no-fund; }

build() {
  install_deps
  npm run build:shared
  npm run build -w flatmeta-api
  rm -rf apps/web/.next-build
  (cd apps/web && NEXT_DIST_DIR=.next-build node scripts/copy-maplibre-worker.mjs && NEXT_DIST_DIR=.next-build npx next build)
  npm run db:migrate
  # Swap the finished web build in (the old one keeps serving until here).
  rm -rf apps/web/.next-prev
  [ -d apps/web/.next ] && mv apps/web/.next apps/web/.next-prev
  mv apps/web/.next-build apps/web/.next
  # Optional: drop devDependencies after the build to save disk (DEPLOY_PRUNE=1 in .env). Off by default,
  # because `npm run db:seed`, `npm run showcase` and other maintenance scripts run through tsx (a dev dependency).
  if [ "${DEPLOY_PRUNE:-0}" = "1" ]; then npm prune --omit=dev --no-audit --no-fund; fi
}

reload() {
  # Apps whose start command changed (args, script, cwd) are recreated; the rest reload with zero downtime.
  node scripts/pm2-sync.cjs || true
  pm2 startOrReload ecosystem.config.cjs --update-env
}

healthy() {
  for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/healthz" && curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT}/robots.txt"; then return 0; fi
    sleep 2
  done
  return 1
}

echo "→ Deploying FlatMeta ($APP_ENV) from origin/$BRANCH in $ROOT"
git fetch --prune --quiet origin "$BRANCH"
git checkout --force --quiet -B "$BRANCH" "origin/$BRANCH"
echo "  at $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
build
reload

if healthy; then
  echo "✓ Healthy: API :$PORT, web :$WEB_PORT ($(git rev-parse --short HEAD))"
  pm2 save >/dev/null
  exit 0
fi

echo "✗ Health check failed (API :$PORT, web :$WEB_PORT)"
if [ -n "$PREV" ] && [ "$PREV" != "$(git rev-parse HEAD)" ]; then
  echo "↩ Rolling back to ${PREV:0:7} (database migrations are not reverted)"
  git checkout --force --quiet "$PREV"
  install_deps && npm run build:shared && npm run build -w flatmeta-api || true
  if [ -d apps/web/.next-prev ]; then rm -rf apps/web/.next && mv apps/web/.next-prev apps/web/.next; fi
  reload || true
fi
exit 1
