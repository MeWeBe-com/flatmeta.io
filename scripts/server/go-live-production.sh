#!/usr/bin/env bash
# Puts the go-live build on production (www.flatmeta.io) and turns automatic production deploys on.
# Run as the app user (najamussaqib), never as root, from any directory:
#
#   bash scripts/server/go-live-production.sh --dry-run      # shows every step and change; changes nothing
#   bash scripts/server/go-live-production.sh                # does it (asks you to type "production" once)
#
# Options:
#   --dry-run              check and print only; no file, cron, deploy or nginx change
#   --commit <sha>         the commit to deploy (default: the go-live build f600f74)
#   --root <dir>           the production checkout (default: the checkout this script is in)
#   --staging-root <dir>   the staging checkout, for its cron line (default: ../../staging.<domain>/private/flatmeta)
#   --no-payments          go live without Stripe (checkout stays off); otherwise the live Stripe keys are required
#   --no-smoke             skip the live smoke test (tests use this; the root script runs it too)
#
# Steps (each prints OK or FAIL; safe to run again, a finished step is skipped):
#   1. preflight: not root; the checkout, node, pm2, git; .env is production
#   2. keys in .env: present and well-formed (names only are printed, never values); stops if one is missing
#   3. .env settings (non-secret only): AUTO_DEPLOY, DEPLOY_BRANCH, REQUIRE_CI, HEALTH_URLS, PAID_CHECKOUT_ENABLED,
#      APP_URL on www; a timestamped backup of .env first (mode 600)
#   4. deploy the commit (scripts/auto-deploy.sh --sha: backup, build, migrate, reload, health, smoke, rollback
#      on failure), skipped when it is already live
#   5. render the nginx include files for this .env (deploy/out/production/)
#   6. move the stale static files out of public_html (llms.txt, llms-full.txt, sitemap.xml, robots.txt)
#   7. cron: the auto-deploy lines for production and staging, and the shared state folder
#   8. smoke test of the live URLs
# Root is needed only to install the nginx include and reload nginx: scripts/server/go-live-production-root.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

DRY=0
COMMIT="f600f7449d5153162b885c910a60d2b0069f01a2"
ROOT="$(cd "$HERE/../.." && pwd)"
STAGING_ROOT=""
PAYMENTS=yes
SMOKE=yes
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --commit) COMMIT="${2:-}"; shift ;;
    --root) ROOT="${2:-}"; shift ;;
    --staging-root) STAGING_ROOT="${2:-}"; shift ;;
    --no-payments) PAYMENTS=no ;;
    --no-smoke) SMOKE=no ;;
    -h | --help) sed -n '2,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
[ "$DRY" = 1 ] && printf 'DRY RUN: nothing will be changed.\n'

# ── 1. Preflight ──
step "1. Preflight"
[ "$(id -u)" != 0 ] || die "Do not run this as root. Run it as the app user (najamussaqib); only scripts/server/go-live-production-root.sh needs root."
ok "running as $(id -un), not root"
[ -d "$ROOT/.git" ] && [ -f "$ROOT/scripts/deploy.sh" ] || die "$ROOT is not the FlatMeta checkout (no .git or scripts/deploy.sh). Pass --root /home/flatmeta/web/flatmeta.io/private/flatmeta"
ok "checkout $ROOT"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && { nvm use 22 >/dev/null 2>&1 || true; }
command -v node >/dev/null || die "node is not installed for $(id -un) (nvm, Node 22)."
command -v pm2 >/dev/null || die "pm2 is not installed for $(id -un) (npm install -g pm2)."
command -v git >/dev/null && command -v curl >/dev/null && command -v crontab >/dev/null || die "git, curl and crontab are needed."
ok "node $(node -v), pm2, git, curl, crontab"
[[ "$COMMIT" =~ ^[0-9a-f]{7,40}$ ]] || die "--commit must be a commit SHA."
load_env "$ROOT"
[ "${APP_ENV:-}" = production ] || die "$ROOT/.env has APP_ENV=${APP_ENV:-unset}, not production. This script is for the production checkout only."
ok "APP_ENV=production"
DOMAIN="${PRODUCTION_DOMAIN:-}"
[ -n "$DOMAIN" ] || die "PRODUCTION_DOMAIN is not set in .env (e.g. PRODUCTION_DOMAIN=flatmeta.io)."
WWW="https://www.$DOMAIN"
APEX="https://$DOMAIN"
SITE_DIR="$(cd "$ROOT/../.." && pwd)"            # /home/<user>/web/<domain>
PUBLIC_HTML="$SITE_DIR/public_html"
[ -n "$STAGING_ROOT" ] || STAGING_ROOT="$(dirname "$SITE_DIR")/staging.$DOMAIN/private/flatmeta"

# ── 2. Keys ──
step "2. Keys and settings in $ROOT/.env (values are never printed)"
need() { if is_set "$1"; then ok "$1 is set"; else fail "$1 is missing or a placeholder in .env. $2"; fi; }
need DATABASE_URL "The production database, e.g. postgres://flatmeta_prod:…@127.0.0.1:5432/flatmeta_prod"
need REDIS_URL "e.g. redis://127.0.0.1:6379/7 (production uses its own DB index)"
if is_set SESSION_SECRET && [ "${#SESSION_SECRET}" -ge 32 ]; then ok "SESSION_SECRET is set (≥ 32 characters)"; else fail "SESSION_SECRET is missing or shorter than 32 characters. Make one with: openssl rand -hex 32"; fi
if [[ "${REDIS_PREFIX:-}" == fm-prod* ]]; then ok "REDIS_PREFIX=${REDIS_PREFIX}"; else fail "REDIS_PREFIX must be fm-prod (it must differ from staging's fm-staging)"; fi
if is_set RESEND_API_KEY; then
  ok "email: RESEND_API_KEY is set (Resend)"
elif is_set SMTP_HOST && is_set SMTP_USER && is_set SMTP_PASS; then
  ok "email: SMTP_HOST, SMTP_USER and SMTP_PASS are set (SMTP)"
else
  fail "email: neither RESEND_API_KEY nor SMTP_HOST + SMTP_USER + SMTP_PASS is set. Without email nobody can sign in on production (codes are never shown on screen there)."
fi
if [ "$PAYMENTS" = yes ]; then
  if is_set STRIPE_SECRET_KEY && [[ "$STRIPE_SECRET_KEY" =~ ^(sk|rk)_live_ ]]; then ok "STRIPE_SECRET_KEY is a live key"; else fail "STRIPE_SECRET_KEY is missing or not a live key (sk_live_… or rk_live_…, named FlatMeta-Stripe, from the FlatMeta account in the boss's Organisation). Or run with --no-payments."; fi
  if is_set STRIPE_PUBLISHABLE_KEY && [[ "$STRIPE_PUBLISHABLE_KEY" == pk_live_* ]]; then ok "STRIPE_PUBLISHABLE_KEY is a live key"; else fail "STRIPE_PUBLISHABLE_KEY is missing or not pk_live_…"; fi
  if is_set STRIPE_WEBHOOK_SECRET && [[ "$STRIPE_WEBHOOK_SECRET" == whsec_* ]]; then ok "STRIPE_WEBHOOK_SECRET is set"; else fail "STRIPE_WEBHOOK_SECRET is missing (whsec_…, from the webhook endpoint $WWW/api/v1/stripe/webhook)"; fi
else
  info "payments skipped (--no-payments): checkout stays off"
fi
if is_set PAYPAL_CLIENT_ID || is_set PAYPAL_CLIENT_SECRET; then
  if is_set PAYPAL_CLIENT_ID && is_set PAYPAL_CLIENT_SECRET; then ok "PayPal: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are set (PAYPAL_ENV=${PAYPAL_ENV:-sandbox})"; else fail "PayPal: set both PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or neither"; fi
else
  info "PayPal not configured (optional): card payments only"
fi
[ "$FM_FAILS" = 0 ] || die "Add the missing keys to $ROOT/.env (nano $ROOT/.env), then run this script again. Nothing was changed."

# ── 3. Settings ──
step "3. Non-secret settings in .env"
BACKED_UP=0
set_env() {
  local key="$1" value="$2" current="${!1-__unset__}"
  if [ "$current" = "$value" ]; then ok "$key already $value"; return; fi
  if [ "$DRY" = 1 ]; then dry "set $key=$value (now: ${current/__unset__/unset})"; return; fi
  if [ "$BACKED_UP" = 0 ]; then
    local bak; bak="$ROOT/.env.bak-$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$ROOT/.env" "$bak" && chmod 600 "$bak" && BACKED_UP=1 && info "backup: $bak"
  fi
  local tmp line; tmp="$(mktemp "$ROOT/.env.tmp.XXXXXX")"
  # Values with spaces are written in double quotes (the .env parser removes them again).
  if [[ "$value" == *" "* ]]; then line="$key=\"$value\""; else line="$key=$value"; fi
  # Replace every "KEY=" line, or append. Other lines (and secrets) are copied byte for byte.
  if grep -qE "^[[:space:]]*(export[[:space:]]+)?$key=" "$ROOT/.env"; then
    awk -v k="$key" -v l="$line" 'BEGIN{re="^[[:space:]]*(export[[:space:]]+)?" k "="} $0 ~ re {if (!done) print l; done=1; next} {print}' "$ROOT/.env" > "$tmp"
  else
    cat "$ROOT/.env" > "$tmp"; printf '%s\n' "$line" >> "$tmp"
  fi
  chmod 600 "$tmp" && mv "$tmp" "$ROOT/.env"
  printf -v "$key" '%s' "$value"
  ok "set $key=$value"
}
set_env AUTO_DEPLOY true
set_env DEPLOY_BRANCH v2
set_env REQUIRE_CI true
set_env HEALTH_URLS "http://127.0.0.1:${WEB_PORT:-3250}/ http://127.0.0.1:${PORT:-3251}/v1/me"
# Every canonical URL, sitemap entry and robots.txt line is built from APP_URL: it must be the www host.
set_env APP_URL "$WWW"
if [ "$PAYMENTS" = yes ]; then set_env PAID_CHECKOUT_ENABLED true; else info "PAID_CHECKOUT_ENABLED left as ${PAID_CHECKOUT_ENABLED:-auto} (off in production)"; fi

# ── 4. Deploy ──
step "4. Deploy ${COMMIT:0:7} to production"
LIVE="$(cat "$ROOT/logs/current" 2>/dev/null || true)"
# A changed .env needs a deploy too: APP_URL and PAID_CHECKOUT_ENABLED are built into the web app.
if [ -n "$LIVE" ] && [[ "$LIVE" == "$COMMIT"* ]] && [ "$BACKED_UP" = 0 ]; then
  ok "${COMMIT:0:7} is already live and .env did not change (logs/current)"
elif [ "$DRY" = 1 ]; then
  dry "bash scripts/auto-deploy.sh --sha ${COMMIT:0:7}   (live now: ${LIVE:0:7}; asks you to type \"production\"; rolls back by itself on failure)"
else
  [ -t 0 ] || die "The deploy asks you to type \"production\": run this script in an interactive terminal."
  info "live now: ${LIVE:0:7}. The deploy takes a database backup first, then builds (a few minutes)."
  if (cd "$ROOT" && bash scripts/auto-deploy.sh --sha "$COMMIT"); then
    LIVE="$(cat "$ROOT/logs/current" 2>/dev/null || true)"
    if [[ "$LIVE" == "$COMMIT"* ]]; then ok "deployed ${COMMIT:0:7}"; else die "The deploy finished but logs/current is ${LIVE:0:7}. See $ROOT/logs/deploy.log"; fi
  else
    die "The deploy failed and was rolled back to ${LIVE:0:7}. Your .env changes are kept (backup next to it). The reason is at the end of $ROOT/logs/deploy.log (tail -n 60 $ROOT/logs/deploy.log)."
  fi
fi

# ── 5. nginx include files ──
step "5. Render the nginx include files (installed by the root script)"
if [ "$DRY" = 1 ]; then dry "node scripts/new-instance.mjs production --nginx-only  →  $ROOT/deploy/out/production/"; else
  (cd "$ROOT" && node scripts/new-instance.mjs production --nginx-only >/dev/null) || die "node scripts/new-instance.mjs production --nginx-only failed."
  if grep -q "if (\$host = $DOMAIN)" "$ROOT/deploy/out/production/nodejs-app.conf" && grep -q 'location = /llms.txt' "$ROOT/deploy/out/production/nodejs-app.conf"; then ok "rendered deploy/out/production/nodejs-app.conf (apex → www, app-served llms.txt, sitemap, robots)"; else fail "the rendered include lacks the apex redirect or the llms.txt location"; fi
fi

# ── 6. Stale static files ──
step "6. Stale static files in $PUBLIC_HTML"
STALE=(llms.txt llms-full.txt sitemap.xml robots.txt)
NEEDS_ROOT=0
if [ ! -d "$PUBLIC_HTML" ]; then warn "$PUBLIC_HTML not found; skipped"; else
  for f in "${STALE[@]}"; do
    p="$PUBLIC_HTML/$f"
    if [ ! -e "$p" ]; then ok "$f not in public_html"; continue; fi
    dest="$SITE_DIR/private/stale-static-$(date -u +%Y%m%d)"
    if [ "$DRY" = 1 ]; then dry "move $p → $dest/"; continue; fi
    if [ -w "$PUBLIC_HTML" ] && mkdir -p "$dest" 2>/dev/null && mv "$p" "$dest/$f"; then ok "moved $f → $dest/ (kept as a backup)"; else NEEDS_ROOT=1; warn "$f is not writable for $(id -un); the root script moves it"; fi
  done
  info "public_html/insights/ stays: the insights articles are served from there"
fi

# ── 7. Cron ──
step "7. Automatic deploys from cron"
STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/flatmeta-deploy-state}"
if [ -d "$STATE_DIR" ]; then ok "state folder $STATE_DIR"; elif [ "$DRY" = 1 ]; then dry "mkdir -m 700 $STATE_DIR"; else mkdir -p "$STATE_DIR" && chmod 700 "$STATE_DIR" && ok "created $STATE_DIR"; fi
CRON_NOW="$(crontab -l 2>/dev/null || true)"
add_cron() {
  local line="$1"
  if grep -qF "$line" <<<"$CRON_NOW"; then ok "cron: $line"; return; fi
  if [ "$DRY" = 1 ]; then dry "add cron: $line"; return; fi
  CRON_NOW="$(printf '%s\n%s\n' "$CRON_NOW" "$line" | sed '/^$/d')"
  printf '%s\n' "$CRON_NOW" | crontab - && ok "added cron: $line"
}
add_cron "*/2 * * * * bash $ROOT/scripts/auto-deploy.sh --cron"
if [ -f "$STAGING_ROOT/scripts/auto-deploy.sh" ]; then add_cron "*/2 * * * * bash $STAGING_ROOT/scripts/auto-deploy.sh --cron"; else warn "staging checkout not found at $STAGING_ROOT; its cron line was not checked (pass --staging-root)"; fi
info "production takes a new commit only after it has been healthy on staging for ${DEPLOY_STAGING_SOAK:-600} s with a passing smoke test"

# ── 8. Smoke ──
if [ "$DRY" = 1 ]; then
  step "8. Smoke test"
  dry "check $WWW and $APEX (health, apex 301, llms.txt, sitemap, robots, pages, payments)"
  printf '\nDry run done: %s warning(s). Run again without --dry-run to apply.\n' "$FM_WARNS"
  exit 0
fi
if [ "$SMOKE" = yes ]; then smoke_live "$WWW" "$APEX" "$COMMIT" "$PAYMENTS"; else step "8. Smoke test"; info "skipped (--no-smoke)"; fi
if [ "$FM_FAILS" -gt 0 ] || [ "$NEEDS_ROOT" = 1 ]; then
  printf '\nNext, as root (installs the nginx include, moves what this user could not, reloads nginx, smoke-tests again):\n  bash %s/scripts/server/go-live-production-root.sh\n' "$ROOT"
fi
finish
