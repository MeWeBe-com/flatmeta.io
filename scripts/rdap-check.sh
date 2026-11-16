#!/usr/bin/env bash
# GL1: domain availability by RDAP, asked of each registry directly.
#   bash scripts/rdap-check.sh flatmeta.com plotglobe.app flatmeta.co.uk
# Prints, per domain: "registered (created …, expires …)", "available (RDAP 404: confirm the price at a registrar)"
# or "unverified (…)". Calibrate with a name you know is taken (google.com) if in doubt.
set -u
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
for d in "$@"; do
  tld=${d#*.}
  case $tld in
    com|net) url="https://rdap.verisign.com/$tld/v1/domain/$d" ;;
    app|dev|page) url="https://pubapi.registry.google/rdap/domain/$d" ;;
    co.uk|uk|org.uk) url="https://rdap.nominet.uk/uk/domain/$d" ;;
    io) url="https://rdap.identitydigital.services/rdap/domain/$d" ;;
    *) url="https://rdap.org/domain/$d" ;;
  esac
  code=$(curl -sL -m 25 -o "$tmp" -w "%{http_code}" "$url")
  if [ "$code" = 200 ]; then
    result=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
ev = {e["eventAction"]: e["eventDate"][:10] for e in d.get("events", [])}
print("registered (created %s, expires %s)" % (ev.get("registration", "?"), ev.get("expiration", "?")))' "$tmp")
  elif [ "$code" = 404 ]; then
    result="available (RDAP 404: confirm the price at a registrar)"
  else
    result="unverified (HTTP $code from $url)"
  fi
  echo "$d: $result"
done
