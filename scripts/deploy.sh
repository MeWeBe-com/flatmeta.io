#!/usr/bin/env bash
# Deploys FlatMeta on the server, as the app's own Linux user (Node 22 from nvm, the user's PM2; no root).
# Usually started by scripts/auto-deploy.sh (cron every 2 minutes, or by hand); CI's staging job also calls it.
#
#   bash scripts/deploy.sh staging [--commit <sha>] [branch]          # staging: the branch tip, or one commit
#   bash scripts/deploy.sh staging --ci v2                            # CI's SSH job: waits for a running deploy, skips if live
#   bash scripts/deploy.sh production [--commit <sha>] [branch]       # by hand: asks you to type "production"
#   bash scripts/deploy.sh <env> --auto --commit <sha>                # cron (auto-deploy.sh) or the CI key; needs AUTO_DEPLOY=true
#   bash scripts/deploy.sh <env> --rollback --commit <sha>            # auto-deploy.sh rollback: go back to an earlier release
#
# Each environment is its own checkout with its own .env, and the name you pass must match it. Who may deploy
# what is decided by scripts/deploy-guard.sh. One deploy at a time per checkout (flock on .deploy/lock, shared with
# auto-deploy.sh and the CI job).
#
# Steps: database backup (abort if it fails) → update code → install → build (web into a side directory) →
# migrate (expand-only) → swap → PM2 reload → health checks (HEALTH_URLS, up to 60 s) → smoke test (DEPLOY_SMOKE) →
# on failure: roll back to the previous release, record the commit in logs/failed-shas, print the backup and the
# restore command. Admins get an email for every production result and every rollback.
#
# State: logs/deploy.log (timestamped, build output included), logs/runs/ (one file per deploy), logs/current
# (the live commit), logs/releases (the last 5 good releases), logs/failed-shas (never deployed automatically again).
#
# Exit codes: 0 deployed (or already live), 1 failed and rolled back, 2 refused or aborted before any change.
set -euo pipefail

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export CI=1
ROOT="${FM_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# Run from a copy: `git checkout` replaces scripts/deploy.sh while this runs, and bash reads scripts as it goes.
if [ -z "${FM_DEPLOY_COPY:-}" ]; then
  mkdir -p .deploy logs/runs
  cp scripts/deploy.sh .deploy/deploy.run.sh
  cp scripts/deploy-guard.sh .deploy/guard.sh
  cp scripts/deploy-backup.sh .deploy/backup.sh 2>/dev/null || true
  cp scripts/deploy-notify.mjs .deploy/notify.mjs 2>/dev/null || true
  cp scripts/deploy-smoke.mjs .deploy/smoke.mjs 2>/dev/null || true
  FM_DEPLOY_COPY=1 FM_ROOT="$ROOT" exec bash .deploy/deploy.run.sh "$@"
fi

ENV_ARG=""
case "${1:-}" in staging | production | development) ENV_ARG="$1"; shift ;; esac
YES=0
AUTO=0
CI_MODE=0
ROLLBACK=0
COMMIT=""
BRANCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1 ;;
    --auto) AUTO=1 ;;
    --ci) CI_MODE=1 ;;
    --rollback) ROLLBACK=1 ;;
    --commit) COMMIT="${2:-}"; shift ;;
    -*) echo "✗ Unknown option $1"; exit 2 ;;
    *) BRANCH="$1" ;;
  esac
  shift
done
# With a forced-command key the client's command arrives in SSH_ORIGINAL_COMMAND: take only the SHA from it.
if [ "$AUTO" = 1 ] && [ -z "$COMMIT" ] && [[ "${SSH_ORIGINAL_COMMAND:-}" =~ --commit[[:space:]]+([0-9a-f]{40}) ]]; then
  COMMIT="${BASH_REMATCH[1]}"
fi

# Node 22 via nvm (cron and non-interactive SSH sessions don't load the user's profile).
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
unset AUTO_DEPLOY HEALTH_URLS
eval "$(node scripts/print-env.mjs)"
PORT="${PORT:-3201}"
WEB_PORT="${WEB_PORT:-3200}"
APP_ENV="${APP_ENV:-production}"
BRANCH="${BRANCH:-${DEPLOY_BRANCH:-v2}}"
FAILED_SHAS="$ROOT/logs/failed-shas"
CURRENT_FILE="$ROOT/logs/current"
touch "$FAILED_SHAS"

# shellcheck disable=SC1091
. .deploy/guard.sh
IS_TTY=0
[ -t 0 ] && IS_TTY=1
if [ "$CI_MODE" = 1 ] && [ "$APP_ENV" = "production" ]; then
  echo "✗ --ci is for staging; production deploys run from cron (scripts/auto-deploy.sh --cron)."
  exit 2
fi
set +e
GUARD_MSG="$(APP_ENV="$APP_ENV" ENV_ARG="$ENV_ARG" AUTO="$AUTO" AUTO_DEPLOY="${AUTO_DEPLOY:-}" IS_TTY="$IS_TTY" COMMIT="$COMMIT" FAILED_SHAS="$FAILED_SHAS" deploy_guard)"
GUARD=$?
set -e
echo "$GUARD_MSG"
[ "$GUARD" = 0 ] || [ "$GUARD" = 10 ] || exit 2

if [ "$APP_ENV" = "production" ] && [ "$AUTO" != 1 ] && [ "$YES" != 1 ]; then
  what="branch '$BRANCH'"
  [ -n "$COMMIT" ] && what="commit ${COMMIT:0:7}"
  [ "$ROLLBACK" = 1 ] && what="a ROLLBACK to ${COMMIT:0:7}"
  read -r -p "Deploy $what to PRODUCTION (${APP_URL:-?})? Type 'production' to continue: " answer
  [ "$answer" = "production" ] || { echo "Cancelled."; exit 2; }
fi

# One deploy at a time. auto-deploy.sh takes the lock first and hands it down (FM_LOCK_HELD=1, fd 9 inherited).
if [ "${FM_LOCK_HELD:-}" = 1 ] && { true >&9; } 2>/dev/null; then
  flock -n 9 || { echo "✗ The deploy lock was not handed down."; exit 2; }
else
  exec 9>>"$ROOT/.deploy/lock"
  if [ "$CI_MODE" = 1 ]; then
    flock -w "${DEPLOY_LOCK_WAIT:-1200}" 9 || { echo "✗ Another deploy has been running for ${DEPLOY_LOCK_WAIT:-1200} s in $ROOT."; exit 2; }
  elif ! flock -n 9; then
    echo "✗ Another deploy is running in $ROOT (see logs/deploy.log)."
    exit 2
  fi
fi

# The live release: what the last good deploy recorded (older servers: .deploy/last-good, else HEAD).
PREV="$(cat "$CURRENT_FILE" 2>/dev/null || cat .deploy/last-good 2>/dev/null || git rev-parse HEAD 2>/dev/null || echo '')"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED=$SECONDS
DEPLOY_LOG="$ROOT/logs/deploy.log"
RUN_LOG="$ROOT/logs/runs/$STAMP-${APP_ENV}.log"
if [ -f "$DEPLOY_LOG" ] && [ "$(wc -c < "$DEPLOY_LOG")" -gt 5000000 ]; then mv -f "$DEPLOY_LOG" "$DEPLOY_LOG.1"; fi
{ ls -1t "$ROOT"/logs/runs/*.log 2>/dev/null | tail -n +31 | xargs -r rm -f; } || true
# Everything below goes to the terminal and, timestamped, to logs/deploy.log and this run's own log.
stamp_lines() { while IFS= read -r line; do printf '%(%Y-%m-%dT%H:%M:%SZ)T %s %s\n' -1 "$APP_ENV" "$line"; done; }
exec > >(TZ=UTC stamp_lines | tee -a "$DEPLOY_LOG" "$RUN_LOG") 2>&1

STEP="start"
notify() { # result [message]
  # Production: every result. Staging: rollbacks and aborts (successes there are routine).
  if [ "$APP_ENV" != "production" ] && [ "$1" = "success" ]; then return 0; fi
  sleep 0.3 # let the log pipe catch up so the email's log tail is complete
  local out
  out="$(node "$ROOT/.deploy/notify.mjs" --root "$ROOT" --env "$APP_ENV" --result "$1" --commit "${TARGET:-$COMMIT}" --prev "$PREV" \
    --message "${2:-}" --step "$STEP" --duration "$(( SECONDS - STARTED ))" --log "$RUN_LOG" 2>&1)" || true
  printf '%s\n' "$out" | head -n 1 # only the summary line: the email itself quotes this log
}

# .env usually sets NODE_ENV=production, which makes npm skip devDependencies. The build needs them (tsc for the
# shared package and the API, tsx for migrations), so always install them.
export NPM_CONFIG_INCLUDE=dev
install_deps() { npm ci --include=dev --no-audit --no-fund; }

SWAPPED=0
# Every step stops the build at its first failure (`set -e` does not apply inside a function called from `if`).
build() {
  STEP="install"; install_deps || return 1
  STEP="build"
  npm run build:shared || return 1
  npm run build -w flatmeta-api || return 1
  rm -rf apps/web/.next-build
  (cd apps/web && NEXT_DIST_DIR=.next-build node scripts/copy-maplibre-worker.mjs && NEXT_DIST_DIR=.next-build npx next build) || return 1
  STEP="migrate"; npm run db:migrate || return 1
  # Swap the finished web build in (the old one keeps serving until here).
  STEP="switch"
  rm -rf apps/web/.next-prev
  if [ -d apps/web/.next ]; then mv apps/web/.next apps/web/.next-prev; fi
  mv apps/web/.next-build apps/web/.next
  SWAPPED=1
  # Optional: drop devDependencies after the build to save disk (DEPLOY_PRUNE=1 in .env).
  if [ "${DEPLOY_PRUNE:-0}" = "1" ]; then npm prune --omit=dev --no-audit --no-fund || true; fi
}

reload() {
  STEP="reload"
  # Apps whose start command changed (args, script, cwd) are recreated; the rest reload with zero downtime.
  node scripts/pm2-sync.cjs || true
  pm2 startOrReload ecosystem.config.cjs --update-env
}

# HEALTH_URLS (space-separated, from .env); default: the web home page and the API's /v1/me on the local ports.
# Every URL must answer 200; API URLs (/v1/) must answer JSON. Up to 60 s in all.
HEALTH_URLS="${HEALTH_URLS:-http://127.0.0.1:${WEB_PORT}/ http://127.0.0.1:${PORT}/v1/me}"
health_once() {
  local url ctype
  for url in $HEALTH_URLS; do
    ctype="$(curl -fsS -o /dev/null -m 10 -w '%{content_type}' "$url" 2>/dev/null)" || return 1
    if [[ "$url" == */v1/* ]] && [[ "$ctype" != application/json* ]]; then return 1; fi
  done
}
healthy() {
  local deadline=$(( SECONDS + ${HEALTH_TIMEOUT:-60} ))
  while [ $SECONDS -lt $deadline ]; do
    health_once && return 0
    sleep 2
  done
  return 1
}

# DEPLOY_SMOKE: http (default: scripts/deploy-smoke.mjs), browser (release-smoke.cjs, needs Chromium) or off.
smoke() {
  local url="${SMOKE_URL:-${APP_URL:-}}"
  case "${DEPLOY_SMOKE:-http}" in
    off) return 0 ;;
    browser) node scripts/release-smoke.cjs "$url" ;;
    *) node .deploy/smoke.mjs "$url" ;;
  esac
}

rollback() {
  if [ -z "$PREV" ] || [ "$PREV" = "$(git rev-parse HEAD)" ]; then return 0; fi
  echo "↩ Rolling back to ${PREV:0:7} (database migrations are not reverted: they are expand-only)"
  git checkout --force --quiet "$PREV"
  install_deps && npm run build:shared && npm run build -w flatmeta-api || true
  if [ "$SWAPPED" = 1 ] && [ -d apps/web/.next-prev ]; then rm -rf apps/web/.next && mv apps/web/.next-prev apps/web/.next; fi
  node scripts/pm2-sync.cjs || true
  pm2 startOrReload ecosystem.config.cjs --update-env || true
  if healthy; then echo "✓ Previous release ${PREV:0:7} is serving again"; else echo "✗ The previous release is not healthy either: check pm2 logs now"; fi
  echo "$PREV" > "$CURRENT_FILE"
}

mark_failed() { # sha reason
  grep -qx "$1" "$FAILED_SHAS" 2>/dev/null || echo "$1" >> "$FAILED_SHAS"
  echo "  Recorded ${1:0:7} in logs/failed-shas ($2): cron will not deploy it again. Deploy it by hand to retry."
}

fail() { # reason
  echo "✗ $1 (step: $STEP)"
  rollback
  mark_failed "$TARGET" "$1"
  if [ -n "$DUMP" ]; then
    echo "  The database is not rolled back. Backup from before the migrations: $DUMP"
    echo "  Restore only if you must: pg_restore --clean --if-exists --no-owner -d \"\$DATABASE_URL\" $DUMP"
  fi
  notify rolled_back "$1"
  exit 1
}

echo "→ Deploying FlatMeta ($APP_ENV) from origin/$BRANCH in $ROOT (web :$WEB_PORT, api :$PORT), live: ${PREV:0:7}"
git fetch --prune --quiet origin "$BRANCH"
if [ -n "$COMMIT" ]; then
  # Only a commit that is on the branch.
  if ! git merge-base --is-ancestor "$COMMIT" "origin/$BRANCH" 2>/dev/null; then
    echo "✗ ${COMMIT:0:7} is not on origin/$BRANCH."
    [ "$AUTO" = 1 ] && TARGET="$COMMIT" notify aborted "The commit is not on origin/$BRANCH."
    exit 2
  fi
  TARGET="$(git rev-parse "$COMMIT^{commit}")"
else
  TARGET="$(git rev-parse "origin/$BRANCH")"
fi
if [ "$TARGET" = "$PREV" ] && { [ "$AUTO" = 1 ] || [ "$CI_MODE" = 1 ]; }; then
  echo "✓ ${TARGET:0:7} is already live."
  exit 0
fi
if [ "$CI_MODE" = 1 ] && grep -qx "$TARGET" "$FAILED_SHAS"; then
  echo "✗ ${TARGET:0:7} already failed a deploy here (logs/failed-shas); it is not retried automatically."
  exit 1
fi
# A database backup before anything changes. No backup, no deploy.
DUMP=""
STEP="backup"
echo "→ Backing up the database"
if ! DUMP="$(bash .deploy/backup.sh "before-${TARGET:0:7}" | tail -n 1)" || [ -z "$DUMP" ]; then
  DUMP=""
  echo "✗ The database backup failed: nothing was changed."
  notify aborted "The database backup (pg_dump) failed, so nothing was changed."
  exit 2
fi
echo "  $DUMP"

STEP="checkout"
git checkout --force --quiet -B "$BRANCH" "$TARGET"
SUBJECT="$(git log -1 --format=%s)"
echo "  at $(git rev-parse --short HEAD): $SUBJECT"
build || fail "The $STEP step failed for ${TARGET:0:7}."
reload || fail "PM2 could not reload the apps for ${TARGET:0:7}."
STEP="health"
healthy || fail "Health checks failed after deploying ${TARGET:0:7} ($HEALTH_URLS)."
STEP="smoke"
smoke || fail "The smoke test failed after deploying ${TARGET:0:7}."

echo "✓ Live and healthy: ${TARGET:0:7} ($SUBJECT) in $(( SECONDS - STARTED )) s"
pm2 save >/dev/null || true
echo "$TARGET" > "$CURRENT_FILE"
echo "$TARGET" > .deploy/last-good
{ grep -vx "$TARGET" "$ROOT/logs/releases" 2>/dev/null || true; echo "$TARGET"; } | tail -n 5 > "$ROOT/logs/releases.tmp" && mv "$ROOT/logs/releases.tmp" "$ROOT/logs/releases"
# A commit that works now (deployed by hand) may be deployed automatically again.
if grep -qx "$TARGET" "$FAILED_SHAS"; then grep -vx "$TARGET" "$FAILED_SHAS" > "$FAILED_SHAS.tmp" || true; mv "$FAILED_SHAS.tmp" "$FAILED_SHAS"; fi
STEP="done"
# Going back by hand: the release we left must not come back on the next cron tick.
if [ "$ROLLBACK" = 1 ] && [ -n "$PREV" ] && [ "$PREV" != "$TARGET" ]; then mark_failed "$PREV" "rolled back by hand"; fi
if [ "$ROLLBACK" = 1 ]; then notify manual_rollback "Rolled back by hand from ${PREV:0:7}: $SUBJECT"; else notify success "$SUBJECT"; fi
exit 0
