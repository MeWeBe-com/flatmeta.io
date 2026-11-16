#!/usr/bin/env bash
# The only go-live steps that need root: install the rendered nginx include for production, move stale static files
# the app user could not, re-apply the Hestia proxy template, reload nginx, then smoke-test the live site.
# Run AFTER scripts/server/go-live-production.sh (which renders deploy/out/production/), as root:
#
#   bash scripts/server/go-live-production-root.sh --dry-run
#   bash scripts/server/go-live-production-root.sh
#
# Options:
#   --dry-run              show the diff and every step; change nothing
#   --root <dir>           the production checkout (default: the checkout this script is in)
#   --hestia-user <name>   the Hestia user that owns the domain (default: the owner of the checkout's web folder)
#   --no-payments          do not check payments in the smoke test
# Safe to run again: an include that is already installed and identical is left alone, and nginx is reloaded only
# when something changed. The previous include is kept next to it as nodejs-app.conf.bak-<time>.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

DRY=0
ROOT="$(cd "$HERE/../.." && pwd)"
HUSER=""
PAYMENTS=yes
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --root) ROOT="${2:-}"; shift ;;
    --hestia-user) HUSER="${2:-}"; shift ;;
    --no-payments) PAYMENTS=no ;;
    -h | --help) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
[ "$DRY" = 1 ] && printf 'DRY RUN: nothing will be changed.\n'

step "1. Preflight"
[ "$(id -u)" = 0 ] || die "This script installs nginx files: run it as root (sudo -i, then the same command)."
ok "running as root"
[ -f "$ROOT/deploy/out/production/nodejs-app.conf" ] || die "$ROOT/deploy/out/production/nodejs-app.conf is missing: run scripts/server/go-live-production.sh as the app user first."
# Read only the two non-secret values needed here (domain and environment) from .env, without loading the rest.
envval() { sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$1=[\"']\{0,1\}\([^\"'#[:space:]]*\).*/\2/p" "$ROOT/.env" | tail -n 1; }
[ "$(envval APP_ENV)" = production ] || die "$ROOT/.env is not APP_ENV=production."
DOMAIN="$(envval PRODUCTION_DOMAIN)"
[ -n "$DOMAIN" ] || die "PRODUCTION_DOMAIN is not set in $ROOT/.env."
SITE_DIR="$(cd "$ROOT/../.." && pwd)"
[ -n "$HUSER" ] || HUSER="$(stat -c %U "$SITE_DIR")"
ok "domain $DOMAIN, Hestia user $HUSER, checkout $ROOT"
command -v nginx >/dev/null || die "nginx not found."
HESTIA_BIN="/usr/local/hestia/bin"
[ -x "$HESTIA_BIN/v-change-web-domain-proxy-tpl" ] || warn "Hestia's v-change-web-domain-proxy-tpl not found; the include is installed and nginx reloaded without it"

step "2. nginx include for $DOMAIN"
CONF_DIR="/home/$HUSER/conf/web/$DOMAIN/nodejs"
CHANGED=0
[ -d "$CONF_DIR" ] || die "$CONF_DIR does not exist. Is $DOMAIN on the NodeJS proxy template in Hestia? (v-list-web-domain $HUSER $DOMAIN)"
for f in nodejs-app.conf nodejs-app-fallback.conf; do
  src="$ROOT/deploy/out/production/$f"; dst="$CONF_DIR/$f"
  [ -f "$src" ] || { info "$f not rendered; skipped"; continue; }
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then ok "$f already installed and identical"; continue; fi
  if [ -f "$dst" ]; then info "changes in $f:"; diff -u "$dst" "$src" | sed -n '1,80p' | sed 's/^/        /' || true; fi
  if [ "$DRY" = 1 ]; then dry "install -m 644 $src $dst"; continue; fi
  [ -f "$dst" ] && cp -p "$dst" "$dst.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  install -m 644 -o root -g root "$src" "$dst" && ok "installed $f" && CHANGED=1
done

step "3. Stale static files in public_html"
PUBLIC_HTML="$SITE_DIR/public_html"
for f in llms.txt llms-full.txt sitemap.xml robots.txt; do
  p="$PUBLIC_HTML/$f"
  if [ ! -e "$p" ]; then ok "$f not in public_html"; continue; fi
  dest="$SITE_DIR/private/stale-static-$(date -u +%Y%m%d)"
  if [ "$DRY" = 1 ]; then dry "move $p → $dest/"; continue; fi
  mkdir -p "$dest" && mv "$p" "$dest/$f" && chown -R "$HUSER:" "$dest" 2>/dev/null || true
  [ -e "$p" ] && fail "could not move $p" || ok "moved $f → $dest/"
done

step "4. Apply and reload nginx"
if [ "$DRY" = 1 ]; then
  dry "v-change-web-domain-proxy-tpl $HUSER $DOMAIN NodeJS; nginx -t; systemctl reload nginx (only if an include changed)"
elif [ "$CHANGED" = 1 ]; then
  if [ -x "$HESTIA_BIN/v-change-web-domain-proxy-tpl" ]; then
    "$HESTIA_BIN/v-change-web-domain-proxy-tpl" "$HUSER" "$DOMAIN" NodeJS >/dev/null && ok "Hestia template NodeJS re-applied for $DOMAIN" || fail "v-change-web-domain-proxy-tpl failed"
  fi
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx && ok "nginx -t passed; nginx reloaded"
  else
    nginx -t 2>&1 | tail -n 5 | sed 's/^/        /'
    for f in nodejs-app.conf nodejs-app-fallback.conf; do b="$(ls -1t "$CONF_DIR/$f.bak-"* 2>/dev/null | head -n 1 || true)"; [ -n "$b" ] && cp -p "$b" "$CONF_DIR/$f"; done
    die "nginx -t failed with the new include; the previous include was put back and nginx was NOT reloaded."
  fi
else
  ok "no include changed; nginx not reloaded"
fi

if [ "$DRY" = 1 ]; then printf '\nDry run done. Run again without --dry-run to apply.\n'; exit 0; fi
LIVE="$(cat "$ROOT/logs/current" 2>/dev/null || true)"
smoke_live "https://www.$DOMAIN" "https://$DOMAIN" "$LIVE" "$PAYMENTS"
finish
