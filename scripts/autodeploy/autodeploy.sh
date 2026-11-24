#!/usr/bin/env bash
# FlatMeta auto-deploy (AD2): the server deploys itself from GitHub. No GitHub Actions and no manual deploys.
# One copy per environment lives at <BASE>/bin/autodeploy.sh, where BASE is the instance's private folder, e.g.
# /home/flatmeta/web/staging.flatmeta.io/private. It runs as the app's own user (never root). install.sh sets it up.
#
#   bash <BASE>/bin/autodeploy.sh --cron        # cron, every 2 minutes: deploy the branch tip if it is new
#   bash <BASE>/bin/autodeploy.sh deploy [sha]  # now: the tip (or one commit), even one that failed before
#   bash <BASE>/bin/autodeploy.sh rebuild       # rebuild + test the LIVE commit in a new folder and swap it in
#                                               # (after a shared/.env change: NEXT_PUBLIC_* is built in)
#   bash <BASE>/bin/autodeploy.sh rollback [sha]   # back to the previous release (or a kept one): no build
#   bash <BASE>/bin/autodeploy.sh status        # live release, branch tip, failed commits, kept releases
#   bash <BASE>/bin/autodeploy.sh pause | resume   # stop or restart automatic deploys (manual ones still work)
#
# Layout under BASE:
#   flatmeta -> releases/<sha>   the live release (a symlink; PM2 runs from this path, so a reload switches)
#   releases/<sha>/              one folder per release: a clean checkout, its own node_modules and build
#   repo.git                     a bare copy of the GitHub repo (fetched read-only)
#   shared/.env                  the one .env (every release links to it); never printed
#   shared/state/                current, previous, failed-shas, paused, lock, history
#   shared/logs/                 autodeploy.log (one line per event) and runs/<time>-<sha>.log (each deploy in full)
#
# A deploy: new folder → npm ci → build → tests → database backup → migrations (expand-only) → switch the symlink →
# PM2 reload → /readyz must show the new commit (web and API) → smoke test. Any failure before the switch leaves the
# live release untouched; any failure after it switches back. Either way the commit is recorded in failed-shas (cron
# never retries it) and the admins get an email. Settings come from shared/.env only:
#   AUTO_DEPLOY=true|false      false: cron deploys nothing (manual deploys and the daily backup still run)
#   DEPLOY_BRANCH=v2            staging: v2; production: production (merging v2 into it is the approval)
#   DEPLOY_TESTS=quick|full|off quick (default): typecheck + web unit tests; full: also the API tests (needs
#                               DATABASE_URL_TEST on its own database); off: none
#   DEPLOY_REPO_URL=            default https://github.com/MeWeBe-com/flatmeta.io.git
#   GITHUB_READ_TOKEN=          fine-grained, read-only (Contents: read) token for that repo; or DEPLOY_KEY_FILE=
#                               path to a read-only deploy key with an ssh:// or git@ DEPLOY_REPO_URL. Never printed.
#   KEEP_RELEASES=2             releases kept on disk besides the live and the previous one (each has its node_modules)
#   READYZ_URL=                 default http://127.0.0.1:$WEB_PORT/readyz
#   DEPLOY_SMOKE=http|off       after the switch, scripts/deploy-smoke.mjs against APP_URL (default http)
set -uo pipefail

BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${AD_BASE:-$(dirname "$BIN")}"
SHARED="$BASE/shared"
STATE="$SHARED/state"
LOGS="$SHARED/logs"
RELEASES="$BASE/releases"
APP_LINK="$BASE/${AD_APP_LINK_NAME:-flatmeta}"
REPO="$BASE/repo.git"
mkdir -p "$STATE" "$LOGS/runs" "$RELEASES"

MODE="cron"; ARG=""
case "${1:-}" in
  --cron | "") MODE="cron" ;;
  deploy | rebuild | rollback | status | pause | resume) MODE="$1"; ARG="${2:-}" ;;
  -h | --help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "Unknown command: $1 (see --help)" >&2; exit 2 ;;
esac
[ "$(id -u)" != 0 ] || { echo "Do not run the auto-deploy as root: run it as the app user." >&2; exit 2; }

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && { nvm use 22 >/dev/null 2>&1 || true; }

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s %s\n' "$(ts)" "$*" >> "$LOGS/autodeploy.log"; [ "$MODE" = cron ] || printf '%s\n' "$*"; }

# Settings from shared/.env only (never from the calling environment), parsed by the app's own parser.
[ -f "$SHARED/.env" ] || { log "✗ $SHARED/.env is missing: run install.sh"; exit 2; }
unset AUTO_DEPLOY DEPLOY_BRANCH DEPLOY_TESTS DEPLOY_REPO_URL GITHUB_READ_TOKEN DEPLOY_KEY_FILE KEEP_RELEASES READYZ_URL DEPLOY_SMOKE
load_env() {
  local parser="$APP_LINK/scripts/print-env.mjs"
  [ -f "$parser" ] || parser="$BIN/print-env.mjs"
  eval "$(node "$parser" "$SHARED/.env")"
}
load_env
APP_ENV="${APP_ENV:-production}"
BRANCH="${DEPLOY_BRANCH:-v2}"
REPO_URL="${DEPLOY_REPO_URL:-https://github.com/MeWeBe-com/flatmeta.io.git}"
READYZ="${READYZ_URL:-http://127.0.0.1:${WEB_PORT:-3200}/readyz}"
FAILED="$STATE/failed-shas"; touch "$FAILED"

# GitHub, read-only. The token reaches git through an askpass helper reading an environment variable, so it is never
# in a URL, a config file, the process list or a log.
git_auth() {
  if [ -n "${DEPLOY_KEY_FILE:-}" ]; then
    export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY_FILE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  elif [ -n "${GITHUB_READ_TOKEN:-}" ]; then
    export FM_GIT_TOKEN="$GITHUB_READ_TOKEN" GIT_ASKPASS="$BIN/git-askpass.sh" GIT_TERMINAL_PROMPT=0
  else
    export GIT_TERMINAL_PROMPT=0
  fi
}
git_auth
fetch() {
  [ -d "$REPO" ] || git clone -q --bare "$REPO_URL" "$REPO" || return 1
  git --git-dir="$REPO" remote set-url origin "$REPO_URL"
  git --git-dir="$REPO" fetch -q --prune origin "+refs/heads/*:refs/heads/*" 2>/dev/null
}

live_sha() { cat "$STATE/current" 2>/dev/null || true; }
lock() { exec 9>>"$STATE/lock"; flock -n 9; }

notify() { # result message step prev
  [ "$APP_ENV" != production ] && [ "$1" = success ] && return 0
  local root="$APP_LINK"; [ -f "$root/scripts/deploy-notify.mjs" ] || return 0
  node "$root/scripts/deploy-notify.mjs" --root "$root" --env "$APP_ENV" --result "$1" --commit "${SHA:-}" --prev "${4:-}" --message "$2" --step "$3" --duration "$(( SECONDS - ${STARTED:-$SECONDS} ))" --log "${RUN_LOG:-/dev/null}" 2>&1 | head -n 1 >> "$LOGS/autodeploy.log" || true
}

# The steps, each overridable for tests (AD_*_CMD); the defaults are the real commands, run inside the release.
run_install() { ${AD_INSTALL_CMD:-npm ci --include=dev --no-audit --no-fund}; }
run_build() {
  if [ -n "${AD_BUILD_CMD:-}" ]; then $AD_BUILD_CMD; return; fi
  npm run build:shared && npm run build -w flatmeta-api && (cd apps/web && node scripts/copy-maplibre-worker.mjs && npx next build)
}
run_tests() {
  if [ -n "${AD_TEST_CMD:-}" ]; then $AD_TEST_CMD; return; fi
  case "${DEPLOY_TESTS:-quick}" in
    off) return 0 ;;
    full) npm run typecheck && npm test -w flatmeta-web && { [ -n "${DATABASE_URL_TEST:-}" ] || { echo "DEPLOY_TESTS=full needs DATABASE_URL_TEST"; return 1; }; } && npm test -w flatmeta-api ;;
    *) npm run typecheck && npm test -w flatmeta-web ;;
  esac
}
run_backup() { if [ -n "${AD_BACKUP_CMD:-}" ]; then $AD_BACKUP_CMD; else bash scripts/deploy-backup.sh "pre-${SHA:0:7}"; fi; }
run_migrate() { ${AD_MIGRATE_CMD:-npm run db:migrate}; }
run_reload() { # in the live link
  if [ -n "${AD_RELOAD_CMD:-}" ]; then $AD_RELOAD_CMD; return; fi
  FM_APP_ROOT="$APP_LINK" RELEASE_SHA="$1" node scripts/pm2-sync.cjs >/dev/null 2>&1 || true
  FM_APP_ROOT="$APP_LINK" RELEASE_SHA="$1" pm2 startOrReload ecosystem.config.cjs --update-env >/dev/null && pm2 save >/dev/null 2>&1
}
readyz_shows() { # sha: web and API both report it
  local body want="${1:0:12}" deadline=$(( SECONDS + ${AD_READYZ_TIMEOUT:-90} ))
  while [ $SECONDS -lt $deadline ]; do
    body="$(curl -fsS -m 5 "$READYZ" 2>/dev/null || true)"
    if [[ "$body" == *'"ok":true'* && "$body" == *"\"release\":\"$want\""* && "$body" == *"\"sameRelease\":true"* ]]; then return 0; fi
    # A release older than /readyz (the first one, kept for rollback): the API's own health must show the commit.
    if [ -z "$body" ] && [ -n "${API_HEALTH_URL:-${PORT:+http://127.0.0.1:$PORT/v1/health}}" ]; then
      body="$(curl -fsS -m 5 "${API_HEALTH_URL:-http://127.0.0.1:$PORT/v1/health}" 2>/dev/null || true)"
      [[ "$body" == *'"ok":true'* && "$body" == *"\"release\":\"$want\""* ]] && curl -fsS -o /dev/null -m 5 "http://127.0.0.1:${WEB_PORT:-3200}/" && return 0
    fi
    sleep "${AD_READYZ_SLEEP:-3}"
  done
  echo "readyz never showed $want (last answer: ${body:0:200})"
  return 1
}
run_smoke() {
  [ "${DEPLOY_SMOKE:-http}" = off ] && return 0
  [ -n "${AD_SMOKE_CMD:-}" ] && { $AD_SMOKE_CMD; return; }
  node scripts/deploy-smoke.mjs "${APP_URL:-}"
}

switch_to() { # sha: atomic symlink swap
  ln -sfn "releases/$1" "$APP_LINK.next" && mv -Tf "$APP_LINK.next" "$APP_LINK"
}

prune() {
  local keep="${KEEP_RELEASES:-2}" cur prev
  cur="$(live_sha)"; prev="$(cat "$STATE/previous" 2>/dev/null || true)"
  ls -1t "$RELEASES" 2>/dev/null | grep -Ev '\.(tmp|old)$' | while read -r d; do
    [ "$d" = "$cur" ] || [ "$d" = "$prev" ] && continue
    keep=$(( keep - 1 )); [ $keep -ge 0 ] && continue
    rm -rf "${RELEASES:?}/$d"
  done
  find "$RELEASES" -maxdepth 1 -name '*.tmp' -mmin +180 -exec rm -rf {} + 2>/dev/null || true
  ls -1t "$LOGS/runs"/*.log 2>/dev/null | tail -n +41 | xargs -r rm -f
}

self_update() { # keep bin/ in step with the release just deployed
  local src="$APP_LINK/scripts/autodeploy"
  [ -d "$src" ] || return 0
  for f in autodeploy.sh git-askpass.sh install.sh; do [ -f "$src/$f" ] && cp "$src/$f" "$BIN/$f.new" && chmod 755 "$BIN/$f.new" && mv -f "$BIN/$f.new" "$BIN/$f"; done
  cp "$APP_LINK/scripts/print-env.mjs" "$BIN/print-env.mjs" 2>/dev/null || true
}

mark_failed() { grep -qx "$1" "$FAILED" || echo "$1" >> "$FAILED"; }

deploy() { # sha
  SHA="$1"; STARTED=$SECONDS
  local prev; prev="$(live_sha)"
  local rel="$RELEASES/$SHA" tmp="$RELEASES/$SHA.tmp" STEP="checkout"
  RUN_LOG="$LOGS/runs/$(date -u +%Y%m%dT%H%M%SZ)-${SHA:0:7}.log"
  log "→ deploying ${SHA:0:7} on $APP_ENV (live: ${prev:0:7}); log: $RUN_LOG"
  (
    set -o pipefail
    if [ ! -f "$rel/.ad-built" ]; then
      rm -rf "$tmp" "$rel"
      git clone -q --shared --no-checkout "$REPO" "$tmp" && git -C "$tmp" checkout -q --detach "$SHA" || { echo "STEP=checkout"; exit 1; }
      ln -sfn "$SHARED/.env" "$tmp/.env"
      rm -rf "$tmp/logs"; ln -sfn "$LOGS" "$tmp/logs"
      cd "$tmp" || exit 1
      export RELEASE_SHA="$SHA" NPM_CONFIG_INCLUDE=dev
      echo "== install"; run_install || { echo "STEP=install"; exit 1; }
      echo "== build"; run_build || { echo "STEP=build"; exit 1; }
      echo "== tests (${DEPLOY_TESTS:-quick})"; run_tests || { echo "STEP=tests"; exit 1; }
      touch .ad-built
      cd "$RELEASES" && mv "$tmp" "$rel" || { echo "STEP=checkout"; exit 1; }
    fi
    cd "$rel" || exit 1
    echo "== database backup"; run_backup || { echo "STEP=backup"; exit 1; }
    echo "== migrations (expand-only)"; run_migrate || { echo "STEP=migrate"; exit 1; }
  ) > "$RUN_LOG" 2>&1
  if [ $? -ne 0 ]; then
    STEP="$(grep -o 'STEP=[a-z]*' "$RUN_LOG" | tail -n 1 | cut -d= -f2)"; STEP="${STEP:-build}"
    rm -rf "$tmp"
    mark_failed "$SHA"
    log "✗ ${SHA:0:7} failed at $STEP before the switch: ${prev:0:7} stays live (tail -n 50 $RUN_LOG)"
    notify aborted "The new release failed at '$STEP'; the live release was not touched." "$STEP" "$prev"
    return 1
  fi
  # Switch, reload, verify. From here a failure switches back.
  [ -n "$prev" ] && echo "$prev" > "$STATE/previous"
  switch_to "$SHA"
  local ok=1 why=""
  (cd "$APP_LINK" && run_reload "$SHA") >> "$RUN_LOG" 2>&1 || { ok=0; why="reload"; }
  [ $ok = 1 ] && { readyz_shows "$SHA" >> "$RUN_LOG" 2>&1 || { ok=0; why="readyz"; }; }
  [ $ok = 1 ] && { (cd "$APP_LINK" && run_smoke) >> "$RUN_LOG" 2>&1 || { ok=0; why="smoke"; }; }
  if [ $ok = 1 ]; then
    echo "$SHA" > "$STATE/current"
    printf '%s %s %s\n' "$(ts)" "$SHA" "deployed" >> "$STATE/history"
    self_update; prune
    log "✓ ${SHA:0:7} is live on $APP_ENV ($(( SECONDS - STARTED )) s); /readyz shows it"
    notify success "$(git -C "$APP_LINK" log -1 --format=%s 2>/dev/null)" done "$prev"
    return 0
  fi
  mark_failed "$SHA"
  if [ -n "$prev" ] && [ -d "$RELEASES/$prev" ]; then
    switch_to "$prev"
    (cd "$APP_LINK" && run_reload "$prev") >> "$RUN_LOG" 2>&1
    readyz_shows "$prev" >> "$RUN_LOG" 2>&1 && log "↩ switched back to ${prev:0:7}" || log "✗ switched back to ${prev:0:7}, but it is not ready either: check pm2 logs"
  fi
  log "✗ ${SHA:0:7} failed at $why after the switch; rolled back (tail -n 50 $RUN_LOG)"
  notify rolled_back "The new release failed at '$why' and was switched back. Migrations are expand-only, so the database was not restored." "$why" "$prev"
  return 1
}

rebuild() { # the live commit, built again (e.g. after a NEXT_PUBLIC_* change in shared/.env)
  SHA="$(live_sha)"; STARTED=$SECONDS
  [ -n "$SHA" ] && [ -d "$RELEASES/$SHA" ] || { echo "Nothing is live to rebuild."; return 2; }
  local rel="$RELEASES/$SHA" tmp="$RELEASES/$SHA.tmp" old="$RELEASES/$SHA.old" STEP="checkout"
  RUN_LOG="$LOGS/runs/$(date -u +%Y%m%dT%H%M%SZ)-rebuild-${SHA:0:7}.log"
  log "→ rebuilding the live ${SHA:0:7} on $APP_ENV; log: $RUN_LOG"
  (
    set -o pipefail
    rm -rf "$tmp"
    git clone -q --shared --no-checkout "$REPO" "$tmp" && git -C "$tmp" checkout -q --detach "$SHA" || { echo "STEP=checkout"; exit 1; }
    ln -sfn "$SHARED/.env" "$tmp/.env"; rm -rf "$tmp/logs"; ln -sfn "$LOGS" "$tmp/logs"
    cd "$tmp" || exit 1
    export RELEASE_SHA="$SHA" NPM_CONFIG_INCLUDE=dev
    echo "== install"; run_install || { echo "STEP=install"; exit 1; }
    echo "== build"; run_build || { echo "STEP=build"; exit 1; }
    echo "== tests (${DEPLOY_TESTS:-quick})"; run_tests || { echo "STEP=tests"; exit 1; }
    touch .ad-built
  ) > "$RUN_LOG" 2>&1
  if [ $? -ne 0 ]; then
    STEP="$(grep -o 'STEP=[a-z]*' "$RUN_LOG" | tail -n 1 | cut -d= -f2)"
    rm -rf "$tmp"
    log "✗ the rebuild of ${SHA:0:7} failed at ${STEP:-build}: the live release was not touched (tail -n 50 $RUN_LOG)"
    notify aborted "The rebuild failed at '${STEP:-build}'; the live release was not touched." "${STEP:-build}" "$SHA"
    return 1
  fi
  # Swap the folders behind the live link (the running apps keep the old files until the reload).
  rm -rf "$old"; mv "$rel" "$old" && mv "$tmp" "$rel"
  if (cd "$APP_LINK" && run_reload "$SHA") >> "$RUN_LOG" 2>&1 && readyz_shows "$SHA" >> "$RUN_LOG" 2>&1; then
    rm -rf "$old"
    printf '%s %s %s\n' "$(ts)" "$SHA" "rebuilt" >> "$STATE/history"
    log "✓ ${SHA:0:7} rebuilt and live ($(( SECONDS - STARTED )) s); /readyz shows it"
    return 0
  fi
  rm -rf "$rel"; mv "$old" "$rel"
  (cd "$APP_LINK" && run_reload "$SHA") >> "$RUN_LOG" 2>&1
  log "✗ the rebuilt ${SHA:0:7} did not come up: the previous build of it is back (tail -n 50 $RUN_LOG)"
  notify rolled_back "The rebuilt release did not come up; the previous build was put back." readyz "$SHA"
  return 1
}

rollback() { # [sha]
  local target="${1:-$(cat "$STATE/previous" 2>/dev/null)}" prev; prev="$(live_sha)"
  if [ -n "$target" ] && [ ! -d "$RELEASES/$target" ]; then target="$(ls -1 "$RELEASES" | grep "^$target" | grep -v '\.tmp$' | head -n 1)"; fi
  [ -n "$target" ] && [ -f "$RELEASES/$target/.ad-built" ] || { echo "No such kept release. Kept: $(ls -1 "$RELEASES" | grep -v '\.tmp$' | cut -c1-7 | tr '\n' ' ')"; return 2; }
  SHA="$target"; STARTED=$SECONDS; RUN_LOG="$LOGS/runs/$(date -u +%Y%m%dT%H%M%SZ)-rollback-${SHA:0:7}.log"
  switch_to "$target"
  (cd "$APP_LINK" && run_reload "$target") >> "$RUN_LOG" 2>&1
  if readyz_shows "$target" >> "$RUN_LOG" 2>&1; then
    echo "$target" > "$STATE/current"; echo "$prev" > "$STATE/previous"
    printf '%s %s %s\n' "$(ts)" "$target" "rollback" >> "$STATE/history"
    log "↩ rolled back to ${target:0:7} (was ${prev:0:7}); /readyz shows it"
    notify manual_rollback "Rolled back by hand from ${prev:0:7}." rollback "$prev"
    return 0
  fi
  log "✗ rolled back to ${target:0:7} but /readyz does not show it: check pm2 logs ($RUN_LOG)"
  return 1
}

case "$MODE" in
  status)
    echo "Environment $APP_ENV · branch $BRANCH · auto-deploy $([ -f "$STATE/paused" ] && echo PAUSED || echo "${AUTO_DEPLOY:-false}") · tests ${DEPLOY_TESTS:-quick}"
    echo "Live:     $(live_sha)  ($(readlink "$APP_LINK" 2>/dev/null))"
    echo "Previous: $(cat "$STATE/previous" 2>/dev/null)"
    fetch && echo "Tip:      $(git --git-dir="$REPO" rev-parse "refs/heads/$BRANCH" 2>/dev/null || echo "no branch '$BRANCH' on GitHub yet")"
    echo "Kept:     $(ls -1t "$RELEASES" | grep -v '\.tmp$' | cut -c1-7 | tr '\n' ' ')"
    echo "Failed:   $(tail -n 5 "$FAILED" | cut -c1-7 | tr '\n' ' ')"
    echo "Readyz:   $(curl -fsS -m 5 "$READYZ" 2>/dev/null || echo 'no answer')"
    echo "Last:     $(tail -n 3 "$LOGS/autodeploy.log" 2>/dev/null)"
    exit 0 ;;
  pause) touch "$STATE/paused"; log "⏸ automatic deploys paused by $(id -un) (resume: $BIN/autodeploy.sh resume)"; exit 0 ;;
  resume) rm -f "$STATE/paused"; log "▶ automatic deploys resumed by $(id -un)"; exit 0 ;;
esac

lock || { [ "$MODE" = cron ] && exit 0; echo "Another deploy is running (tail -f $LOGS/autodeploy.log)."; exit 2; }

if [ "$MODE" = rollback ]; then rollback "$ARG"; exit $?; fi
if [ "$MODE" = rebuild ]; then fetch || true; rebuild; exit $?; fi

# Daily database backup, also while paused (from the live release's own script).
if [ "$MODE" = cron ] && [ -f "$APP_LINK/scripts/deploy-backup.sh" ] && [ -z "${AD_BACKUP_CMD:-}" ]; then
  (cd "$APP_LINK" && bash scripts/deploy-backup.sh --if-older 24 daily >/dev/null 2>&1) || log "✗ the daily database backup failed"
fi

if [ "$MODE" = cron ]; then
  [ "${AUTO_DEPLOY:-false}" = true ] || exit 0
  [ -f "$STATE/paused" ] && exit 0
fi
fetch || { log "✗ could not fetch $REPO_URL (check GITHUB_READ_TOKEN / DEPLOY_KEY_FILE in shared/.env)"; exit 1; }
if [ "$MODE" = deploy ] && [ -n "$ARG" ]; then
  TARGET="$(git --git-dir="$REPO" rev-parse --verify -q "$ARG^{commit}")" || { echo "No such commit: $ARG"; exit 2; }
  git --git-dir="$REPO" merge-base --is-ancestor "$TARGET" "refs/heads/$BRANCH" 2>/dev/null || { echo "${TARGET:0:7} is not on $BRANCH"; exit 2; }
else
  TARGET="$(git --git-dir="$REPO" rev-parse -q --verify "refs/heads/$BRANCH")" || { [ "$MODE" = cron ] && { grep -q "no-branch-$BRANCH" "$STATE/notes" 2>/dev/null || { log "… waiting: no branch '$BRANCH' on GitHub yet (creating it is the first approval)"; echo "no-branch-$BRANCH" >> "$STATE/notes"; }; exit 0; }; echo "No branch '$BRANCH' on GitHub."; exit 2; }
fi
if [ "$TARGET" = "$(live_sha)" ]; then [ "$MODE" = cron ] || echo "✓ ${TARGET:0:7} is already live."; exit 0; fi
if [ "$MODE" = cron ] && grep -qx "$TARGET" "$FAILED"; then exit 0; fi
deploy "$TARGET"
