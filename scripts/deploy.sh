#!/usr/bin/env bash
# Deploys FlatMeta on the server, as the app's own Linux user (Node 22 from nvm, the user's PM2; no root).
#
#   bash scripts/deploy.sh staging [branch]                  # CI does this after every green push to v2
#   bash scripts/deploy.sh production [branch]               # by hand: asks you to type "production"
#   bash scripts/deploy.sh production --auto --commit <sha>  # CI only, after the staging smoke test passes
#   bash scripts/deploy.sh [branch]                          # older form: the environment comes from .env
#
# Each environment is its own checkout with its own .env, and the name you pass must match it. Who may deploy
# what is decided by scripts/deploy-guard.sh: automatic production deploys need --auto, a non-interactive SSH
# session (the CI key, ideally a forced command), AUTO_DEPLOY=true in the production .env, a full commit SHA on
# origin/<branch>, and a commit that has not failed here before (failed commits are never retried automatically).
#
# Steps: [production: pg_dump] → update code → install → build (web into a side directory) → migrate → swap →
# PM2 reload → health checks (API /healthz, web / and /robots.txt) → on failure roll back to the previous release
# [automatic: and record the commit as failed]. Production deploys email the admins with the result.
#
# Exit codes: 0 deployed (or already live), 1 failed and rolled back, 2 refused or aborted before any change.
set -euo pipefail

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CI=1
ROOT="${FM_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# Run from a copy: `git checkout` replaces scripts/deploy.sh while this runs, and bash reads scripts as it goes.
if [ -z "${FM_DEPLOY_COPY:-}" ]; then
  mkdir -p .deploy/failed .deploy/logs
  cp scripts/deploy.sh .deploy/deploy.run.sh
  cp scripts/deploy-guard.sh .deploy/guard.sh
  cp scripts/deploy-notify.mjs .deploy/notify.mjs 2>/dev/null || true
  FM_DEPLOY_COPY=1 FM_ROOT="$ROOT" exec bash .deploy/deploy.run.sh "$@"
fi

ENV_ARG=""
case "${1:-}" in staging | production | development) ENV_ARG="$1"; shift ;; esac
YES=0
AUTO=0
COMMIT=""
BRANCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1 ;;
    --auto) AUTO=1 ;;
    --commit) COMMIT="${2:-}"; shift ;;
    *) BRANCH="$1" ;;
  esac
  shift
done
BRANCH="${BRANCH:-${DEPLOY_BRANCH:-v2}}"
# With a forced-command key the client's command arrives in SSH_ORIGINAL_COMMAND: take only the SHA from it.
if [ "$AUTO" = 1 ] && [ -z "$COMMIT" ] && [[ "${SSH_ORIGINAL_COMMAND:-}" =~ --commit[[:space:]]+([0-9a-f]{40}) ]]; then
  COMMIT="${BASH_REMATCH[1]}"
fi

# Node 22 via nvm (non-interactive SSH sessions don't load the user's profile).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null
fi
command -v node >/dev/null || { echo "✗ node not found (install nvm and Node 22 for this user)"; exit 2; }
command -v pm2 >/dev/null || { echo "✗ pm2 not found (npm install -g pm2)"; exit 2; }

# Load .env safely. AUTO_DEPLOY must come from the file, never from the calling environment.
[ -f .env ] || { echo "✗ $ROOT/.env is missing. Copy .env.example and fill it in."; exit 2; }
unset AUTO_DEPLOY
eval "$(node scripts/print-env.mjs)"
PORT="${PORT:-3201}"
WEB_PORT="${WEB_PORT:-3200}"
APP_ENV="${APP_ENV:-production}"

# shellcheck disable=SC1091
. .deploy/guard.sh
IS_TTY=0
[ -t 0 ] && IS_TTY=1
set +e
GUARD_MSG="$(APP_ENV="$APP_ENV" ENV_ARG="$ENV_ARG" AUTO="$AUTO" AUTO_DEPLOY="${AUTO_DEPLOY:-}" IS_TTY="$IS_TTY" COMMIT="$COMMIT" FAILED_DIR="$ROOT/.deploy/failed" deploy_guard)"
GUARD=$?
set -e
echo "$GUARD_MSG"
[ "$GUARD" = 0 ] || [ "$GUARD" = 10 ] || exit 2

if [ "$APP_ENV" = "production" ] && [ "$AUTO" != 1 ] && [ "$YES" != 1 ]; then
  read -r -p "Deploy branch '$BRANCH' to PRODUCTION (${APP_URL:-?})? Type 'production' to continue: " answer
  [ "$answer" = "production" ] || { echo "Cancelled."; exit 2; }
fi

# One deploy at a time.
exec 9>"$ROOT/.deploy/lock"
if command -v flock >/dev/null && ! flock -n 9; then
  echo "✗ Another deploy is running in $ROOT."
  exit 2
fi

PREV="$(git rev-parse HEAD 2>/dev/null || echo '')"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$ROOT/.deploy/logs/$STAMP-${APP_ENV}.log"
if [ "$APP_ENV" = "production" ]; then
  exec > >(tee -a "$LOG") 2>&1
  { ls -1t "$ROOT"/.deploy/logs/*.log 2>/dev/null | tail -n +31 | xargs -r rm -f; } || true
fi

notify() { # result [message]
  [ "$APP_ENV" = "production" ] || return 0
  node "$ROOT/.deploy/notify.mjs" --root "$ROOT" --result "$1" --commit "${TARGET:-$COMMIT}" --prev "$PREV" --message "${2:-}" --log "$LOG" || true
}

# .env usually sets NODE_ENV=production, which makes npm skip devDependencies. The build needs them (tsc for the
# shared package and the API, tsx for migrations), so always install them.
export NPM_CONFIG_INCLUDE=dev
install_deps() { npm ci --include=dev --no-audit --no-fund; }

SWAPPED=0
# Every step stops the build at its first failure (`set -e` does not apply inside a function called from `if`).
build() {
  install_deps || return 1
  npm run build:shared || return 1
  npm run build -w flatmeta-api || return 1
  rm -rf apps/web/.next-build
  (cd apps/web && NEXT_DIST_DIR=.next-build node scripts/copy-maplibre-worker.mjs && NEXT_DIST_DIR=.next-build npx next build) || return 1
  npm run db:migrate || return 1
  # Swap the finished web build in (the old one keeps serving until here).
  rm -rf apps/web/.next-prev
  if [ -d apps/web/.next ]; then mv apps/web/.next apps/web/.next-prev; fi
  mv apps/web/.next-build apps/web/.next
  SWAPPED=1
  # Optional: drop devDependencies after the build to save disk (DEPLOY_PRUNE=1 in .env).
  if [ "${DEPLOY_PRUNE:-0}" = "1" ]; then npm prune --omit=dev --no-audit --no-fund || true; fi
}

reload() {
  # Apps whose start command changed (args, script, cwd) are recreated; the rest reload with zero downtime.
  node scripts/pm2-sync.cjs || true
  pm2 startOrReload ecosystem.config.cjs --update-env
}

healthy() {
  for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/healthz" \
      && curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT}/robots.txt" \
      && curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT}/"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  if [ -z "$PREV" ] || [ "$PREV" = "$(git rev-parse HEAD)" ]; then return 0; fi
  echo "↩ Rolling back to ${PREV:0:7} (database migrations are not reverted: they are expand-only)"
  git checkout --force --quiet "$PREV"
  install_deps && npm run build:shared && npm run build -w flatmeta-api || true
  if [ "$SWAPPED" = 1 ] && [ -d apps/web/.next-prev ]; then rm -rf apps/web/.next && mv apps/web/.next-prev apps/web/.next; fi
  reload || true
  if healthy; then echo "✓ Previous release ${PREV:0:7} is serving again"; else echo "✗ The previous release is not healthy either: check pm2 logs now"; fi
}

fail() { # reason
  echo "✗ $1"
  rollback
  if [ "$AUTO" = 1 ]; then
    printf '%s\n%s\n' "$STAMP" "$1" > "$ROOT/.deploy/failed/$TARGET"
    echo "  Recorded ${TARGET:0:7} as failed: it will not be deployed automatically again."
  fi
  notify rolled_back "$1${DUMP:+. Database backup from before the migrations: $DUMP}"
  exit 1
}

echo "→ Deploying FlatMeta ($APP_ENV) from origin/$BRANCH in $ROOT (web :$WEB_PORT, api :$PORT)"
git fetch --prune --quiet origin "$BRANCH"
if [ "$AUTO" = 1 ]; then
  # Only a commit that is on the branch; nothing else can be deployed by the CI key.
  if ! git merge-base --is-ancestor "$COMMIT" "origin/$BRANCH" 2>/dev/null; then
    echo "✗ ${COMMIT:0:7} is not on origin/$BRANCH."
    TARGET="$COMMIT" notify aborted "The commit is not on origin/$BRANCH."
    exit 2
  fi
  TARGET="$COMMIT"
else
  TARGET="$(git rev-parse "origin/$BRANCH")"
fi
if [ "$TARGET" = "$PREV" ] && [ "$AUTO" = 1 ]; then
  echo "✓ ${TARGET:0:7} is already live."
  exit 0
fi

# Production: a database backup before anything changes. No backup, no deploy.
DUMP=""
if [ "$APP_ENV" = "production" ]; then
  BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$HOME/backups/flatmeta-deploys}"
  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
  DUMP="$BACKUP_DIR/$STAMP-before-${TARGET:0:7}.dump"
  echo "→ Backing up the database to $DUMP"
  if ! pg_dump --format=custom --no-owner --file "$DUMP" "$DATABASE_URL"; then
    rm -f "$DUMP"
    echo "✗ pg_dump failed: nothing was changed."
    notify aborted "pg_dump failed, so nothing was changed."
    exit 2
  fi
  chmod 600 "$DUMP"
  { ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +"$(( ${DEPLOY_KEEP_DUMPS:-10} + 1 ))" | xargs -r rm -f; } || true
fi

git checkout --force --quiet -B "$BRANCH" "$TARGET"
echo "  at $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
build || fail "The build or the migrations failed for ${TARGET:0:7}."
reload || fail "PM2 could not reload the apps for ${TARGET:0:7}."

if healthy; then
  echo "✓ Healthy: API :$PORT, web :$WEB_PORT ($(git rev-parse --short HEAD))"
  pm2 save >/dev/null
  echo "$TARGET" > "$ROOT/.deploy/last-good"
  notify success "$(git log -1 --format=%s)"
  exit 0
fi
fail "Health checks failed after deploying ${TARGET:0:7} (API :$PORT /healthz, web :$WEB_PORT / and /robots.txt)."
