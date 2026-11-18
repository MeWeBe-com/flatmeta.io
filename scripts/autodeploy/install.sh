#!/usr/bin/env bash
# Installs the FlatMeta auto-deploy (AD2) for ONE environment. Idempotent: run it again any time; a finished step is
# skipped. Runs as the app user (najamussaqib), never root. No root step is needed.
#
#   bash install.sh staging    /home/flatmeta/web/staging.flatmeta.io/private
#   bash install.sh production /home/flatmeta/web/flatmeta.io/private
#   (add --dry-run to see what it would do)
#
# It:
#   1. checks the tools (node, npm, pm2, git, flock, crontab) and that it is not root;
#   2. turns the existing checkout <BASE>/flatmeta into the first release: moves it to <BASE>/releases/<sha>, puts
#      <BASE>/flatmeta back as a symlink to it (the same path, so PM2, nginx and docs keep working), moves .env and
#      logs into <BASE>/shared, and moves media folders out of the release if any were inside it;
#   3. writes the non-secret settings into shared/.env: AUTO_DEPLOY=true, DEPLOY_BRANCH (staging: v2, production:
#      production), DEPLOY_TESTS=quick;
#   4. GitHub access: if shared/.env has neither GITHUB_READ_TOKEN nor DEPLOY_KEY_FILE, asks for a read-only token at
#      a hidden prompt (Enter skips it when the repo is public), checks it with `git ls-remote`, stores it (mode 600);
#   5. installs <BASE>/bin/ (the runner, its git helper, this script) and the bare repo copy <BASE>/repo.git;
#   6. cron: replaces this checkout's old auto-deploy line with `*/2 * * * * bash <BASE>/bin/autodeploy.sh --cron`;
#   7. prints the status. The next cron tick (within 2 minutes) deploys the branch tip if it is new.
set -euo pipefail

ENVNAME="${1:-}"; BASE="${2:-}"; DRY=0
[ "${3:-}" = "--dry-run" ] && DRY=1
case "$ENVNAME" in staging | production) ;; *) echo "Usage: bash install.sh <staging|production> <BASE> [--dry-run]"; exit 2 ;; esac
[ -n "$BASE" ] && [ -d "$BASE" ] || { echo "FAIL  $BASE is not a folder (the instance's private folder, e.g. /home/flatmeta/web/staging.flatmeta.io/private)"; exit 2; }
BASE="$(cd "$BASE" && pwd)"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ok() { printf 'OK    %s\n' "$*"; }
dry() { printf 'DRY   would: %s\n' "$*"; }
die() { printf 'FAIL  %s\n' "$*"; exit 1; }
do_() { if [ "$DRY" = 1 ]; then dry "$*"; else eval "$@"; fi; }

echo "== 1. Preflight ($ENVNAME, $BASE)"
[ "$(id -u)" != 0 ] || die "Run this as the app user (najamussaqib), not root."
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && { nvm use 22 >/dev/null 2>&1 || true; }
for t in node npm pm2 git flock crontab curl; do command -v "$t" >/dev/null || die "$t is not installed for $(id -un)"; done
ok "$(id -un), node $(node -v), pm2, git, flock, crontab"

APP="$BASE/flatmeta"; SHARED="$BASE/shared"; STATE="$SHARED/state"; REL="$BASE/releases"; BIN="$BASE/bin"
echo "== 2. Release layout"
do_ "mkdir -p '$SHARED/logs/runs' '$STATE' '$REL' '$BIN'"
if [ -L "$APP" ]; then
  ok "$APP is already a release link → $(readlink "$APP")"
elif [ -d "$APP/.git" ]; then
  # The old in-place auto-deploy must not run while (or after) the checkout moves: drop its cron line first, then
  # wait for any deploy it is running (its lock).
  OLDCRON="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$OLDCRON" | grep -qF "$APP/scripts/auto-deploy.sh"; then
    if [ "$DRY" = 1 ]; then dry "remove the old auto-deploy cron line for $APP"; else
      printf '%s\n' "$OLDCRON" | { grep -vF "$APP/scripts/auto-deploy.sh" || true; } | sed '/^$/d' | crontab -
      ok "old auto-deploy cron line for $APP removed"
    fi
  fi
  if [ "$DRY" = 0 ] && [ -d "$APP/.deploy" ]; then
    exec 8>>"$APP/.deploy/lock"; flock -w 1200 8 || die "an old deploy has been running for 20 minutes in $APP: wait for it, then run again"
  fi
  SHA="$(git -C "$APP" rev-parse HEAD)"
  echo "      the existing checkout is at ${SHA:0:7}: it becomes the first release"
  if [ -f "$APP/.env" ] && [ ! -L "$APP/.env" ]; then
    [ -f "$SHARED/.env" ] && die "$SHARED/.env and $APP/.env both exist: keep one, then run again"
    do_ "mv '$APP/.env' '$SHARED/.env' && chmod 600 '$SHARED/.env'"
  fi
  [ -f "$SHARED/.env" ] || [ "$DRY" = 1 ] || die "no .env found ($APP/.env or $SHARED/.env)"
  if [ -d "$APP/logs" ] && [ ! -L "$APP/logs" ]; then
    do_ "cp -a '$APP/logs/.' '$SHARED/logs/' 2>/dev/null; rm -rf '$APP/logs'"
    [ -f "$SHARED/logs/failed-shas" ] && do_ "cp '$SHARED/logs/failed-shas' '$STATE/failed-shas'"
  fi
  # Media must live outside the release, or the next release would not see it.
  ENVSRC="$SHARED/.env"; [ -f "$ENVSRC" ] || ENVSRC="$APP/.env"
  for key in MEDIA_DIR EXTERNAL_IMAGE_DIR; do
    val="$(sed -n "s/^[[:space:]]*$key=[\"']\{0,1\}\([^\"'#[:space:]]*\).*/\1/p" "$ENVSRC" 2>/dev/null | tail -n 1)"
    abs="$val"; [[ "$val" = /* ]] || abs="$APP/apps/api/${val:-./storage/media}"
    if [[ "$abs" != "$APP"* ]]; then ok "$key is outside the release: $val"; continue; fi
    dest="$SHARED/$(basename "$abs")"
    [ -d "$abs" ] && do_ "mkdir -p '$dest' && cp -a '$abs/.' '$dest/'"
    do_ "sed -i '/^[[:space:]]*$key=/d' '$SHARED/.env' && echo '$key=$dest' >> '$SHARED/.env'"
    ok "$key moves to $dest (it was inside the checkout)"
  done
  do_ "mv '$APP' '$REL/$SHA' && ln -sfn '$SHARED/.env' '$REL/$SHA/.env' && ln -sfn '$SHARED/logs' '$REL/$SHA/logs' && touch '$REL/$SHA/.ad-built'"
  do_ "ln -sfn 'releases/$SHA' '$APP' && echo '$SHA' > '$STATE/current'"
  ok "$APP → releases/${SHA:0:7} (the same path as before, now a link)"
else
  die "$APP is neither a checkout nor a release link. Create the instance first (scripts/new-instance.mjs), then run again."
fi

echo "== 3. Settings in shared/.env (non-secret)"
ENVF="$SHARED/.env"
get() { sed -n "s/^[[:space:]]*$1=[\"']\{0,1\}\([^\"'#]*\).*/\1/p" "$ENVF" 2>/dev/null | tail -n 1 | sed 's/[[:space:]]*$//'; }
setv() { # key value
  [ "$(get "$1")" = "$2" ] && { ok "$1 already $2"; return; }
  do_ "sed -i '/^[[:space:]]*$1=/d' '$ENVF' && echo '$1=$2' >> '$ENVF'"
  [ "$DRY" = 1 ] || ok "set $1=$2"
}
[ "$(get APP_ENV)" = "$ENVNAME" ] || [ "$DRY" = 1 ] || die "$ENVF has APP_ENV=$(get APP_ENV), not $ENVNAME: wrong folder?"
BR=v2; [ "$ENVNAME" = production ] && BR=production
setv AUTO_DEPLOY true
setv DEPLOY_BRANCH "$BR"
[ -n "$(get DEPLOY_TESTS)" ] || setv DEPLOY_TESTS quick

echo "== 4. GitHub access (read-only; never printed)"
REPO_URL="$(get DEPLOY_REPO_URL)"; REPO_URL="${REPO_URL:-https://github.com/MeWeBe-com/flatmeta.io.git}"
if [ -n "$(get DEPLOY_KEY_FILE)" ]; then
  ok "DEPLOY_KEY_FILE is set (a read-only deploy key)"
elif [ -n "$(get GITHUB_READ_TOKEN)" ]; then
  ok "GITHUB_READ_TOKEN is set"
elif [ "$DRY" = 1 ]; then
  dry "ask for a read-only GitHub token at a hidden prompt"
else
  echo "      A fine-grained token: GitHub → Settings → Developer settings → Fine-grained tokens → Generate, name"
  echo "      FlatMeta-Deploy-Read, repository MeWeBe-com/flatmeta.io only, permission Contents: Read-only."
  read -rsp "      Paste it (input hidden; press Enter to skip if the repo is public): " TOKEN; echo
  if [ -n "$TOKEN" ]; then
    FM_GIT_TOKEN="$TOKEN" GIT_ASKPASS="$SRC/git-askpass.sh" GIT_TERMINAL_PROMPT=0 git ls-remote -q "$REPO_URL" HEAD >/dev/null 2>&1 || die "GitHub refused the token (nothing was saved). Check its repository and Contents: Read-only, then run again."
    umask 077; sed -i '/^[[:space:]]*GITHUB_READ_TOKEN=/d' "$ENVF"; printf 'GITHUB_READ_TOKEN=%s\n' "$TOKEN" >> "$ENVF"; chmod 600 "$ENVF"; unset TOKEN
    ok "token checked with GitHub and saved in shared/.env (mode 600)"
  else
    GIT_TERMINAL_PROMPT=0 git ls-remote -q "$REPO_URL" HEAD >/dev/null 2>&1 || die "The repo is not public and no token was given. Run again and paste the token."
    ok "no token: the repo is public, read access works without one"
  fi
fi

echo "== 5. Runner and repo copy"
for f in autodeploy.sh git-askpass.sh install.sh; do do_ "install -m 755 '$SRC/$f' '$BIN/$f'"; done
PRINT="$SRC/../print-env.mjs"; [ -f "$PRINT" ] || PRINT="$APP/scripts/print-env.mjs"
do_ "install -m 644 '$PRINT' '$BIN/print-env.mjs'"
if [ "$DRY" = 1 ]; then dry "fetch $REPO_URL into $BASE/repo.git"; else
  bash "$BIN/autodeploy.sh" status >/dev/null 2>&1 || true
  [ -d "$BASE/repo.git" ] && ok "repo.git fetched" || die "could not fetch $REPO_URL into $BASE/repo.git (see $SHARED/logs/autodeploy.log)"
fi

echo "== 6. Cron (every 2 minutes, as $(id -un))"
LINE="*/2 * * * * bash $BIN/autodeploy.sh --cron"
NOW="$(crontab -l 2>/dev/null || true)"
NEW="$(printf '%s\n' "$NOW" | grep -vF "$APP/scripts/auto-deploy.sh" | grep -vF "$BIN/autodeploy.sh" ; echo "$LINE")"
if printf '%s\n' "$NOW" | grep -qxF "$LINE" && ! printf '%s\n' "$NOW" | grep -qF "$APP/scripts/auto-deploy.sh"; then ok "cron already: $LINE"
elif [ "$DRY" = 1 ]; then dry "crontab: remove the old auto-deploy line for $APP, add: $LINE"
else printf '%s\n' "$NEW" | sed '/^$/d' | crontab - && ok "cron: $LINE (old line for this checkout removed)"; fi

echo "== 7. Status"
[ "$DRY" = 1 ] && { echo; echo "Dry run: nothing changed."; exit 0; }
bash "$BIN/autodeploy.sh" status || true
echo
if [ "$ENVNAME" = production ]; then
  echo "Production follows the branch 'production'. Approving = merging v2 into it on GitHub (the first time: create the"
  echo "branch 'production' from v2). The cron deploys it within 2 minutes."
else
  echo "Staging follows v2: every new commit there deploys within 2 minutes."
fi
echo "Log: tail -f $SHARED/logs/autodeploy.log · pause: bash $BIN/autodeploy.sh pause · roll back: bash $BIN/autodeploy.sh rollback"
