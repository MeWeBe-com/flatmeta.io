#!/usr/bin/env bash
# R3 (Round 3): the Cloudflare part of go-live as ONE command, for whoever holds the boss's main Cloudflare account
# (Fahad or the owner). Runs anywhere with bash, curl and node; no server access needed.
#
#   CLOUDFLARE_API_TOKEN=… bash scripts/server/cloudflare-zone.sh --dry-run    # shows what it would change
#   CLOUDFLARE_API_TOKEN=… bash scripts/server/cloudflare-zone.sh              # does it
#
# The token: Cloudflare → My Profile → API Tokens → Create token → "Create custom token", name "FlatMeta-DNS",
# permissions Zone · Zone Settings · Edit, Zone · DNS · Edit, Zone · Email Routing Rules · Edit, limited to the
# zone flatmeta.io. Type it in the shell only (never in a file or chat). The script never prints it.
#
# What it does (each step prints OK, SKIP or FAIL; safe to run again):
#   1. finds the zone (default flatmeta.io; --zone to change)
#   2. Email Address Obfuscation: off (it rewrote addresses and broke React hydration, Round 2 R2-1)
#   3. Email Routing: on (Cloudflare adds its MX and SPF records); the routing rules need a verified inbox, see below
#   4. DMARC: adds _dmarc TXT "v=DMARC1; p=none; rua=mailto:dmarc@<zone>; fo=1" if there is none
#   5. SPF: adds "v=spf1 include:_spf.mx.cloudflare.net ~all" on the apex if there is no SPF record yet
#   6. prints the state, then the one click left: the routing rules (hello@, support@, dmarc@, admin@ → an inbox)
set -euo pipefail

ZONE="flatmeta.io"
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --zone) ZONE="${2:-}"; shift ;;
    -h | --help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
FAILS=0
ok() { printf 'OK    %s\n' "$*"; }
skip() { printf 'SKIP  %s\n' "$*"; }
fail() { FAILS=$((FAILS + 1)); printf 'FAIL  %s\n' "$*"; }
dry() { printf 'DRY   would: %s\n' "$*"; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "FAIL  CLOUDFLARE_API_TOKEN is not set. Create the token named FlatMeta-DNS (see the top of this script) and run: CLOUDFLARE_API_TOKEN=… bash $0"; exit 1; }
command -v curl >/dev/null && command -v node >/dev/null || { echo "FAIL  curl and node are needed"; exit 1; }
API="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"
# The token goes in a header read from a file descriptor, so it never appears in the process list or the output.
cf() {
  local args=(-sS --max-time 30 -X "$1" -H 'Content-Type: application/json' "$API$2")
  [ -n "${3:-}" ] && args+=(--data "$3")
  # The header file must be opened on curl's own command line: a <(…) made earlier is already closed.
  curl -H @<(printf 'Authorization: Bearer %s\n' "$CLOUDFLARE_API_TOKEN") "${args[@]}"
}
# Reads a value from a JSON reply: js '<expression on r>'.
js() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let r;try{r=JSON.parse(s)}catch{r={}};const v=($1);process.stdout.write(v===undefined||v===null?'':String(v))})"; }

echo "== 1. Zone $ZONE"
Z="$(cf GET "/zones?name=$ZONE")"
ZID="$(js 'r.result&&r.result[0]&&r.result[0].id' <<<"$Z")"
[ -n "$ZID" ] || { fail "zone $ZONE not found for this token ($(js '(r.errors||[]).map(e=>e.message).join("; ")' <<<"$Z")). Is the token limited to $ZONE, in the boss's main account?"; exit 1; }
ok "zone $ZONE found"

echo "== 2. Email Address Obfuscation"
cur="$(cf GET "/zones/$ZID/settings/email_obfuscation" | js 'r.result&&r.result.value')"
if [ "$cur" = off ]; then ok "already off"
elif [ "$DRY" = 1 ]; then dry "turn it off (now: ${cur:-unknown})"
else
  res="$(cf PATCH "/zones/$ZID/settings/email_obfuscation" '{"value":"off"}' | js 'r.success&&r.result.value')"
  [ "$res" = off ] && ok "turned off" || fail "could not turn it off: Security → Settings → Email Address Obfuscation → Off, by hand"
fi

echo "== 3. Email Routing"
er="$(cf GET "/zones/$ZID/email/routing")"
if [ "$(js 'r.result&&r.result.enabled' <<<"$er")" = true ]; then ok "already on"
elif [ "$DRY" = 1 ]; then dry "turn Email Routing on (Cloudflare adds its MX and SPF records)"
else
  res="$(cf POST "/zones/$ZID/email/routing/enable" '{}')"
  if [ "$(js 'r.success' <<<"$res")" = true ]; then ok "turned on"; else fail "could not turn it on ($(js '(r.errors||[]).map(e=>e.message).join("; ")' <<<"$res")): Email → Email Routing → Get started, by hand"; fi
fi

upsert_txt() { # name, value, test-regex, label
  local name="$1" value="$2" re="$3" label="$4" have
  have="$(cf GET "/zones/$ZID/dns_records?type=TXT&name=$name" | js "(r.result||[]).map(x=>x.content.replace(/^\"|\"$/g,'')).filter(c=>/$re/i.test(c)).join(' | ')")"
  if [ -n "$have" ]; then ok "$label present: $have"; return; fi
  if [ "$DRY" = 1 ]; then dry "add TXT $name \"$value\""; return; fi
  local body; body="$(node -e 'console.log(JSON.stringify({type:"TXT",name:process.argv[1],content:process.argv[2],ttl:3600}))' "$name" "$value")"
  [ "$(cf POST "/zones/$ZID/dns_records" "$body" | js 'r.success')" = true ] && ok "added $label: $value" || fail "could not add $label; add TXT $name \"$value\" by hand"
}
echo "== 4. DMARC"
upsert_txt "_dmarc.$ZONE" "v=DMARC1; p=none; rua=mailto:dmarc@$ZONE; fo=1" '^v=DMARC1' "DMARC"
echo "== 5. SPF"
upsert_txt "$ZONE" "v=spf1 include:_spf.mx.cloudflare.net ~all" '^v=spf1' "SPF"

echo "== 6. Left to do (one click-path, needs your inbox)"
echo "      Cloudflare → $ZONE → Email → Email Routing → Destination addresses → add the owner's inbox and click the"
echo "      link Cloudflare emails. Then Routing rules → Create: hello@, support@, dmarc@ and admin@$ZONE → that inbox."
echo "      Check afterwards, on the server: npm run email:check -w flatmeta-api -- --domain $ZONE"
[ "$DRY" = 1 ] && { echo; echo "Dry run: nothing changed."; exit 0; }
echo
[ "$FAILS" = 0 ] && echo "ALL OK" || { echo "$FAILS FAILED: each FAIL line says the click-path to do it by hand. Safe to run again."; exit 1; }
