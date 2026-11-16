#!/usr/bin/env bash
# Shared helpers for scripts/server/*.sh (sourced, not run). No secrets are ever printed: values read from .env are
# only tested (set or missing, prefix, length) and reported by name.

FM_FAILS=0
FM_WARNS=0
if [ -t 1 ]; then C_OK=$'\e[32m'; C_FAIL=$'\e[31m'; C_WARN=$'\e[33m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'; else C_OK=''; C_FAIL=''; C_WARN=''; C_DIM=''; C_OFF=''; fi

step() { printf '\n== %s\n' "$*"; }
ok() { printf '%sOK%s    %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { FM_WARNS=$((FM_WARNS + 1)); printf '%sWARN%s  %s\n' "$C_WARN" "$C_OFF" "$*"; }
fail() { FM_FAILS=$((FM_FAILS + 1)); printf '%sFAIL%s  %s\n' "$C_FAIL" "$C_OFF" "$*"; }
info() { printf '%s      %s%s\n' "$C_DIM" "$*" "$C_OFF"; }
dry() { printf '%sDRY%s   would: %s\n' "$C_WARN" "$C_OFF" "$*"; }
# Stop now: a step the rest depends on failed. The message says what to do.
die() { fail "$*"; printf '\nStopped. Nothing after this step was run.\n'; exit 1; }

# Reads the checkout's .env into the current shell without printing it (same parser as the app: scripts/print-env.mjs).
load_env() {
  local root="$1"
  [ -f "$root/.env" ] || die "$root/.env is missing."
  local out
  out="$(cd "$root" && node scripts/print-env.mjs)" || die "Could not read $root/.env (node scripts/print-env.mjs failed)."
  eval "$out"
}

# Whether a variable is set and not a placeholder. Never prints the value.
is_set() {
  local v="${!1:-}"
  [ -n "$v" ] && [[ "$v" != change-me* ]] && [[ "$v" != *REPLACE* ]] && [[ "$v" != "..." ]]
}

# The live checks against the public site. Every check is a plain HTTPS request; nothing is sent but the URL.
#   smoke_live <www-base> <apex-base> <expected-release-prefix|''> <payments: yes|no>
smoke_live() {
  local www="$1" apex="$2" want="$3" pay="$4" body code loc
  step "Smoke test of the live site ($www)"
  body="$(curl -fsS --max-time 20 "$www/api/v1/health" 2>/dev/null || true)"
  if [[ "$body" == *'"ok":true'* ]]; then
    local rel; rel="$(sed -n 's/.*"release":"\([0-9a-f]*\)".*/\1/p' <<<"$body")"
    if [ -z "$want" ] || [[ "$want" == "$rel"* ]] || [[ "$rel" == "$want"* ]]; then ok "/api/v1/health ok:true, release ${rel:-?}"; else fail "/api/v1/health answers release ${rel:-?}, expected ${want:0:12}"; fi
  else
    fail "/api/v1/health is not ok:true (production is not on the go-live build yet)"
  fi
  local cl; cl="$(curl -sS -o /dev/null --max-time 20 -w '%{http_code} %{redirect_url}' "$apex/pricing?x=1" 2>/dev/null || true)"
  code="${cl%% *}"; code="${code:-000}"; loc="${cl#* }"; [ "$loc" = "$cl" ] && loc=""
  if [ "$code" = 301 ] && [ "$loc" = "$www/pricing?x=1" ]; then ok "$apex/pricing → 301 $loc"; else fail "$apex/pricing answers $code ${loc:-}, expected 301 to $www/pricing?x=1 (nginx include: run the root script)"; fi
  body="$(curl -fsS --max-time 20 "$www/llms.txt" 2>/dev/null || true)"
  if [[ "$body" == "# FlatMeta"* ]] && ! grep -qi 'digital twin' <<<"$body"; then ok "/llms.txt is the app's own"; else fail "/llms.txt is missing or still the old static file (stale public_html/llms.txt or nginx include: run the root script)"; fi
  body="$(curl -fsS --max-time 20 "$www/sitemap.xml" 2>/dev/null || true)"
  if [[ "$body" == *'<sitemapindex'* ]]; then ok "/sitemap.xml is the sitemap index"; else fail "/sitemap.xml is not the app's sitemap index (stale public_html/sitemap.xml or nginx include)"; fi
  body="$(curl -fsS --max-time 20 "$www/robots.txt" 2>/dev/null || true)"
  if grep -q "^Sitemap: $www/sitemap.xml" <<<"$body" && ! grep -qx 'Disallow: /' <<<"$body"; then ok "/robots.txt lists $www/sitemap.xml and allows crawling"; else fail "/robots.txt is not the app's production robots.txt"; fi
  local path
  for path in / /pricing /business /for/brands /compare/google-business-profile /insights /brands /leaderboards /api/v1/leaderboards/xp-week; do
    code="$(curl -sS -o /dev/null --max-time 30 -w '%{http_code}' "$www$path" 2>/dev/null || true)"; code="${code:-000}"
    if [ "$code" = 200 ]; then ok "$path 200"; else fail "$path answers $code"; fi
  done
  body="$(curl -fsS --max-time 20 "$www/api/v1/features" 2>/dev/null || true)"
  if [ "$pay" = yes ]; then
    if [[ "$body" == *'"paidCheckout":true'* ]]; then ok "/api/v1/features paidCheckout:true (checkout is on)"; else fail "/api/v1/features does not say paidCheckout:true"; fi
    body="$(curl -fsS --max-time 20 "$www/pricing" 2>/dev/null || true)"
    if [ -z "$body" ]; then fail "/pricing did not load"; elif grep -qi 'coming soon' <<<"$body"; then fail "/pricing still says \"coming soon\""; else ok "/pricing has no \"coming soon\""; fi
  else
    info "payments not checked (--no-payments)"
  fi
  body="$(curl -fsS --max-time 20 "$www/business" 2>/dev/null || true)"
  if [ -z "$body" ]; then fail "/business did not load"; elif grep -q '__cf_email__' <<<"$body"; then warn "Cloudflare Email Obfuscation is still on (MANUAL-STEPS → Launch checklist step 4.5); the app's own addresses are protected, owners' addresses are not"; else ok "no Cloudflare email rewriting on /business"; fi
}

finish() {
  printf '\n'
  if [ "$FM_FAILS" = 0 ]; then
    printf '%sALL OK%s (%s warnings)\n' "$C_OK" "$C_OFF" "$FM_WARNS"
    return 0
  fi
  printf '%s%s FAILED%s, %s warnings. Each FAIL line says what to do; the script is safe to run again.\n' "$C_FAIL" "$FM_FAILS" "$C_OFF" "$FM_WARNS"
  return 1
}
