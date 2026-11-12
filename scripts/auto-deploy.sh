#!/usr/bin/env bash
# Automatic deploys from cron, for staging and production (each checkout runs its own copy, as the app user).
#
#   */2 * * * * bash /home/flatmeta/web/flatmeta.io/private/flatmeta/scripts/auto-deploy.sh --cron
#
#   bash scripts/auto-deploy.sh --cron           # cron: silent unless the branch moved
#   bash scripts/auto-deploy.sh                  # by hand: deploy the branch tip now, even if it failed before
#   bash scripts/auto-deploy.sh --sha <commit>   # by hand: deploy one commit of the branch
#   bash scripts/auto-deploy.sh rollback [sha]   # by hand: back to the previous release (or a kept one, see status)
#   bash scripts/auto-deploy.sh status           # what is live, the branch tip, failed commits, the gates
# Production by hand still asks you to type "production".
#
# Configuration comes from this checkout's .env only:
#   AUTO_DEPLOY=true|false   false (the default): cron deploys nothing (the daily backup still runs)
#   DEPLOY_BRANCH=v2         the branch to follow
#   REQUIRE_CI=true|false    deploy only commits whose GitHub checks all passed (default true)
#   GITHUB_READ_TOKEN=       only for a private repo: fine-grained, read-only Checks + Commit statuses
#   HEALTH_URLS="url url"    default: web / and API /v1/me on the local ports (200, JSON for the API)
#   DEPLOY_SMOKE=http|browser|off, DEPLOY_STATE_DIR, DEPLOY_STAGING_SOAK (seconds, default 600), DEPLOY_BACKUP_DIR,
#   DEPLOY_BACKUP_DAYS (default 7)
#
# A cron tick: lock (a tick that finds a deploy running exits) → daily backup if the last is > 24 h old →
# AUTO_DEPLOY? → git fetch → tip == live? (staging: re-check health, smoke-test a release it has not tested) →
# tip in logs/failed-shas? → production only: the same commit live and healthy on staging for 10 minutes with a
# passing smoke test → CI passed? (pending: next tick; failed: recorded as failed) →
# scripts/deploy.sh <env> --auto --commit <tip> (backup, build, migrate, reload, health, smoke, rollback on failure).
#
# Staging writes its verdict per commit to $DEPLOY_STATE_DIR (default ~/flatmeta-deploy-state, shared by both
# checkouts because they run as the same user): staging-ok-<sha> or staging-failed-<sha>.
set -euo pipefail
ROOT="${FM_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# Run from a copy: the deploy checks out new code, which replaces this file while it runs.
if [ -z "${FM_AUTO_COPY:-}" ]; then
  mkdir -p .deploy logs
  cp scripts/auto-deploy.sh .deploy/auto-deploy.run.sh
  FM_AUTO_COPY=1 FM_ROOT="$ROOT" exec bash .deploy/auto-deploy.run.sh "$@"
fi

MODE="tip"
SHA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cron) MODE="cron" ;;
    --sha) MODE="sha"; SHA="${2:-}"; shift ;;
    rollback) MODE="rollback"; if [[ "${2:-}" =~ ^[0-9a-f]{7,40}$ ]]; then SHA="$2"; shift; fi ;;
    status) MODE="status" ;;
    -h | --help) sed -n '2,12p' "$ROOT/scripts/auto-deploy.sh" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "✗ Unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
fi
command -v node >/dev/null || { echo "✗ auto-deploy: node not found (nvm, Node 22)" >&2; exit 2; }
[ -f .env ] || { echo "✗ auto-deploy: $ROOT/.env is missing" >&2; exit 2; }
# Settings come from the .env file only, never from the calling environment.
unset AUTO_DEPLOY REQUIRE_CI DEPLOY_BRANCH HEALTH_URLS GITHUB_READ_TOKEN DEPLOY_STATE_DIR DEPLOY_STAGING_SOAK DEPLOY_SMOKE
eval "$(node scripts/print-env.mjs)"
APP_ENV="${APP_ENV:-production}"
BRANCH="${DEPLOY_BRANCH:-v2}"
STATE="${DEPLOY_STATE_DIR:-$HOME/flatmeta-deploy-state}"
SOAK="${DEPLOY_STAGING_SOAK:-600}"
FAILED_SHAS="$ROOT/logs/failed-shas"
mkdir -p "$STATE" logs/.notes && chmod 700 "$STATE"
touch "$FAILED_SHAS"
HEALTH_URLS="${HEALTH_URLS:-http://127.0.0.1:${WEB_PORT:-3200}/ http://127.0.0.1:${PORT:-3201}/v1/me}"

log() { # to logs/deploy.log; also to the terminal when run by hand
  printf '%(%Y-%m-%dT%H:%M:%SZ)T %s [auto] %s\n' -1 "$APP_ENV" "$*" >> logs/deploy.log
  if [ "$MODE" != "cron" ]; then echo "$*"; fi
}
log_once() { # key message: log a waiting state once, not on every tick
  local f="logs/.notes/$1"
  [ -e "$f" ] && return 0
  : > "$f"
  log "$2"
}
export TZ=UTC
now() { date +%s; }
kv() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1; }
write_marker() { # file key=value...
  local tmp="$1.tmp.$$"
  printf '%s\n' "${@:2}" > "$tmp" && mv -f "$tmp" "$1"
}
live_sha() { cat logs/current 2>/dev/null || cat .deploy/last-good 2>/dev/null || git rev-parse HEAD; }
repo_slug() {
  if [ -n "${DEPLOY_REPO:-}" ]; then echo "$DEPLOY_REPO"; return; fi
  git remote get-url origin | sed -E 's#^(https://|git@)github\.com[:/]##; s#\.git$##'
}
health_once() {
  local url ctype
  for url in $HEALTH_URLS; do
    ctype="$(curl -fsS -o /dev/null -m 10 -w '%{content_type}' "$url" 2>/dev/null)" || return 1
    if [[ "$url" == */v1/* ]] && [[ "$ctype" != application/json* ]]; then return 1; fi
  done
}
run_smoke() {
  case "${DEPLOY_SMOKE:-http}" in
    off) return 2 ;;
    browser) node scripts/release-smoke.cjs "${SMOKE_URL:-${APP_URL:-}}" ;;
    *) node scripts/deploy-smoke.mjs "${SMOKE_URL:-${APP_URL:-}}" ;;
  esac
}

# ── Staging: the verdict production waits for ──
staging_verdict() { # sha result(ok|failed) [smoke]
  local t; t="$(now)"
  if [ "$2" = ok ]; then
    rm -f "$STATE/staging-failed-$1"
    write_marker "$STATE/staging-ok-$1" "sha=$1" "smoke=${3:-pass}" "live_since=$t" "last_check=$t" "healthy=1"
  else
    rm -f "$STATE/staging-ok-$1"
    write_marker "$STATE/staging-failed-$1" "sha=$1" "at=$t"
  fi
}
staging_watch() { # sha: called on idle staging ticks
  local sha="$1" ok="$STATE/staging-ok-$1" t
  t="$(now)"
  if [ ! -e "$ok" ] && [ ! -e "$STATE/staging-failed-$sha" ]; then
    # Live but never verified here (deployed by CI or by hand): health + smoke once.
    log "Verifying ${sha:0:7} on staging (health + smoke test)"
    local out rc
    if ! health_once; then
      log_once "unhealthy-$sha" "✗ ${sha:0:7} is not healthy on staging ($HEALTH_URLS); production waits"
      return 0
    fi
    set +e; out="$(run_smoke 2>&1)"; rc=$?; set -e
    printf '%s\n' "$out" | { grep -v '^[[:space:]]*$' || true; } | tail -n 20 | while IFS= read -r l; do log "  $l"; done
    if [ "$rc" = 0 ]; then staging_verdict "$sha" ok; log "✓ ${sha:0:7} passed on staging"
    elif [ "$rc" = 2 ]; then staging_verdict "$sha" ok skipped; log "${sha:0:7} healthy on staging; smoke test off (DEPLOY_SMOKE=off), so production will not take it"
    else staging_verdict "$sha" failed; log "✗ ${sha:0:7} failed the smoke test on staging; production will not take it"; fi
    return 0
  fi
  [ -e "$ok" ] || return 0
  if health_once; then
    if [ "$(kv "$ok" healthy)" != 1 ]; then
      log "✓ ${sha:0:7} is healthy on staging again (the 10-minute clock restarts)"
      rm -f "logs/.notes/unhealthy-$sha"
      write_marker "$ok" "sha=$sha" "smoke=$(kv "$ok" smoke)" "live_since=$t" "last_check=$t" "healthy=1"
    else
      write_marker "$ok" "sha=$sha" "smoke=$(kv "$ok" smoke)" "live_since=$(kv "$ok" live_since)" "last_check=$t" "healthy=1"
    fi
  else
    log_once "unhealthy-$sha" "✗ ${sha:0:7} is not healthy on staging ($HEALTH_URLS); production waits"
    write_marker "$ok" "sha=$sha" "smoke=$(kv "$ok" smoke)" "live_since=0" "last_check=$t" "healthy=0"
  fi
}

# ── Production: only what staging has run, healthy, for DEPLOY_STAGING_SOAK seconds ──
staging_gate() { # sha → 0 go, 1 wait
  local sha="$1" ok="$STATE/staging-ok-$1" t
  t="$(now)"
  if [ -e "$STATE/staging-failed-$sha" ]; then log_once "stg-failed-$sha" "Waiting: ${sha:0:7} failed on staging; production skips it until a newer commit passes there"; return 1; fi
  if [ ! -e "$ok" ]; then log_once "stg-wait-$sha" "Waiting: ${sha:0:7} has no staging verdict yet ($STATE/staging-ok-${sha})"; return 1; fi
  if [ "$(kv "$ok" smoke)" != pass ]; then log_once "stg-smoke-$sha" "Waiting: staging did not run the smoke test for ${sha:0:7} (DEPLOY_SMOKE=off there)"; return 1; fi
  if [ "$(kv "$ok" healthy)" != 1 ]; then log_once "stg-unhealthy-$sha" "Waiting: ${sha:0:7} is not healthy on staging"; return 1; fi
  if [ $(( t - $(kv "$ok" last_check) )) -gt 300 ]; then log_once "stg-stale-$sha" "Waiting: staging has not checked ${sha:0:7} for 5 minutes (is its cron running, and is it still live there?)"; return 1; fi
  local left=$(( $(kv "$ok" live_since) + SOAK - t ))
  if [ "$left" -gt 0 ]; then log_once "stg-soak-$sha" "Waiting: ${sha:0:7} passed on staging; production deploys it after $SOAK s healthy there (${left} s to go)"; return 1; fi
  return 0
}

# ── CI: every check run and status on the commit passed (cached per commit, shared by both checkouts) ──
ci_gate() { # sha → 0 success, 1 pending, 3 failed
  local sha="$1" res
  [ "${REQUIRE_CI:-true}" = "true" ] || return 0
  [ -e "$STATE/ci-success-$sha" ] && return 0
  res="$(node scripts/deploy-ci-status.mjs "$(repo_slug)" "$sha" 2>&1 | tail -n 1)"
  case "$res" in
    success) : > "$STATE/ci-success-$sha"; log "✓ CI passed for ${sha:0:7}"; return 0 ;;
    failed*) log "✗ CI failed for ${sha:0:7} (${res#failed }): recorded as failed, not deployed"; return 3 ;;
    *) log_once "ci-pending-$sha" "Waiting for CI on ${sha:0:7} (${res#pending })"; return 1 ;;
  esac
}

# ── The deploy itself (scripts/deploy.sh does the work and writes the log) ──
LOCK_TAKEN=0
take_lock() {
  exec 9>>"$ROOT/.deploy/lock"
  if flock -n 9; then LOCK_TAKEN=1; return 0; fi
  return 1
}
deploy() { # args for deploy.sh after the environment
  FM_LOCK_HELD=1 bash scripts/deploy.sh "$APP_ENV" "$@"
}
after_deploy() { # rc sha
  [ "$APP_ENV" = "staging" ] || return 0
  if [ "$1" = 0 ]; then
    if [ "${DEPLOY_SMOKE:-http}" = off ]; then staging_verdict "$2" ok skipped; else staging_verdict "$2" ok; fi
  elif [ "$1" = 1 ]; then
    staging_verdict "$2" failed
  fi
}

if [ "$MODE" = "status" ]; then
  echo "Environment: $APP_ENV, branch $BRANCH, AUTO_DEPLOY=${AUTO_DEPLOY:-false}, REQUIRE_CI=${REQUIRE_CI:-true}"
  echo "Live: $(live_sha)"
  git fetch --quiet origin "$BRANCH" 2>/dev/null && echo "Tip:  $(git rev-parse "origin/$BRANCH")"
  echo "Kept releases (newest last; 'rollback <sha>'):"; sed 's/^/  /' logs/releases 2>/dev/null || echo "  none yet"
  echo "Failed (never deployed automatically):"; tail -n 10 "$FAILED_SHAS" | sed 's/^/  /'
  for f in "$STATE"/staging-*; do [ -e "$f" ] && echo "State: $(basename "$f") $(tr '\n' ' ' < "$f")"; done
  exit 0
fi

if ! take_lock; then
  [ "$MODE" = "cron" ] && exit 0
  echo "✗ Another deploy is running in $ROOT (tail -f logs/deploy.log)." >&2
  exit 2
fi

if [ "$MODE" != "cron" ]; then
  # By hand: no gates; deploy.sh asks for "production" where it applies.
  git fetch --prune --quiet origin "$BRANCH"
  case "$MODE" in
    tip) TARGET="$(git rev-parse "origin/$BRANCH")" ;;
    sha) TARGET="$(git rev-parse --verify --quiet "$SHA^{commit}" || true)" ;;
    rollback)
      if [ -n "$SHA" ]; then TARGET="$(git rev-parse --verify --quiet "$SHA^{commit}" || true)"
      else
        # The release before the live one, from the last 5 good releases.
        TARGET="$(grep -vx "$(live_sha)" logs/releases 2>/dev/null | tail -n 1 || true)"
      fi
      ;;
  esac
  if [ -z "${TARGET:-}" ]; then echo "✗ No such commit, or no earlier release to go back to (see: bash scripts/auto-deploy.sh status)." >&2; exit 2; fi
  LEFT="$(live_sha)"
  log "Manual ${MODE} deploy of ${TARGET:0:7} started by $(id -un)"
  set +e
  if [ "$MODE" = "rollback" ]; then deploy --rollback --commit "$TARGET" "$BRANCH"; else deploy --commit "$TARGET" "$BRANCH"; fi
  rc=$?
  set -e
  after_deploy "$rc" "$TARGET"
  # Rolled back on staging: production must not take the release staging just left.
  if [ "$MODE" = "rollback" ] && [ "$rc" = 0 ] && [ "$APP_ENV" = "staging" ] && [ "$LEFT" != "$TARGET" ]; then staging_verdict "$LEFT" failed; fi
  exit "$rc"
fi

# ── Cron tick ──
find logs/.notes -type f -mtime +7 -delete 2>/dev/null || true
find "$STATE" -maxdepth 1 -type f \( -name 'staging-*' -o -name 'ci-success-*' \) -mtime +30 -delete 2>/dev/null || true

# Daily backup (also while deploys are paused).
if out="$(bash scripts/deploy-backup.sh --if-older 24 daily 2>&1)"; then
  [ -n "$out" ] && log "Daily database backup: $(printf '%s' "$out" | tail -n 1)"
else
  log_once "backup-failed-$(date +%F)" "✗ The daily database backup failed: $(printf '%s' "$out" | tail -n 1)"
fi

[ "${AUTO_DEPLOY:-false}" = "true" ] || exit 0

if ! git fetch --prune --quiet origin "$BRANCH" 2>/dev/null; then
  log_once "fetch-$(date +%F-%H)" "✗ git fetch origin $BRANCH failed"
  exit 0
fi
TIP="$(git rev-parse "origin/$BRANCH")"
LIVE="$(live_sha)"

if [ "$TIP" = "$LIVE" ]; then
  [ "$APP_ENV" = "staging" ] && staging_watch "$LIVE"
  exit 0
fi
if grep -qx "$TIP" "$FAILED_SHAS"; then
  log_once "skip-$TIP" "Skipping ${TIP:0:7}: it is in logs/failed-shas (deploy it by hand to retry)"
  [ "$APP_ENV" = "staging" ] && staging_watch "$LIVE"
  exit 0
fi

# Production checks staging's verdict first: it is local, and by then staging has cached the CI result, so only
# staging spends the unauthenticated GitHub API allowance (60 requests an hour per IP).
if [ "$APP_ENV" = "production" ] && ! staging_gate "$TIP"; then exit 0; fi

set +e; ci_gate "$TIP"; ci=$?; set -e
if [ "$ci" = 3 ]; then echo "$TIP" >> "$FAILED_SHAS"; exit 0; fi
if [ "$ci" != 0 ]; then
  [ "$APP_ENV" = "staging" ] && staging_watch "$LIVE"
  exit 0
fi

log "Branch $BRANCH moved to ${TIP:0:7} (live: ${LIVE:0:7}): deploying"
set +e
FM_TRIGGER=cron deploy --auto --commit "$TIP" "$BRANCH" < /dev/null > /dev/null 2>&1
rc=$?
set -e
after_deploy "$rc" "$TIP"
case "$rc" in
  0) echo "FlatMeta $APP_ENV: deployed ${TIP:0:7}" ;;
  1) echo "FlatMeta $APP_ENV: deploy of ${TIP:0:7} failed and was rolled back (see $ROOT/logs/deploy.log)" ;;
  *) echo "FlatMeta $APP_ENV: deploy of ${TIP:0:7} did not start (exit $rc; see $ROOT/logs/deploy.log)"; log "deploy.sh refused or aborted (exit $rc)" ;;
esac
exit 0
