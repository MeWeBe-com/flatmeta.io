#!/usr/bin/env bash
# QA3: find what writes the insights articles into public_html/insights/ on this server. READ-ONLY: it changes nothing.
# Run as root on cp2 (it reads every user's crontab and the login logs):
#
#   sudo bash scripts/server/find-insights-writer.sh [/home/flatmeta/web/flatmeta.io/public_html/insights]
#
# What we already know from the articles themselves (17 Nov): they link to https://mewebe.com/startup with
# utm_medium=seo_article and utm_source=flatmeta.io, and the newest was written at 06:35 UTC. So it is MeWeBe's
# SEO-article pipeline, writing here either from a cron job on this server or by uploading over SSH/SFTP/FTP.
set -uo pipefail
DIR="${1:-/home/flatmeta/web/flatmeta.io/public_html/insights}"
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo): it reads every user's crontab and the auth logs. It changes nothing."; exit 1; }
[ -d "$DIR" ] || { echo "No such folder: $DIR (pass the insights folder as the first argument)"; exit 1; }
say() { printf '\n== %s\n' "$*"; }

say "1. Newest files: owner, group, time written (UTC)"
ls -la --time-style=+%Y-%m-%dT%H:%M:%SZ -t "$DIR" | head -n 12
NEWEST="$(ls -t "$DIR"/*.html 2>/dev/null | head -n 1)"
OWNER="$(stat -c %U "$NEWEST" 2>/dev/null || echo '?')"
WHEN="$(TZ=UTC stat -c %y "$NEWEST" 2>/dev/null | cut -c1-16)"
echo "Newest: $NEWEST, owner $OWNER, written $WHEN UTC"

say "2. Cron jobs that mention the folder, public_html, insights, seo or mewebe (every user)"
for f in /var/spool/cron/crontabs/* /var/spool/cron/* /etc/crontab /etc/cron.d/*; do
  [ -f "$f" ] && grep -HnEi 'insights|public_html|seo|mewebe|article' "$f" 2>/dev/null
done
for d in /etc/cron.hourly /etc/cron.daily; do grep -rlEi 'insights|seo_article|mewebe' "$d" 2>/dev/null; done

say "3. systemd timers and services that mention insights, seo or mewebe"
systemctl list-timers --all --no-pager 2>/dev/null | head -n 30
grep -rlEi 'insights|seo_article|mewebe' /etc/systemd/system /lib/systemd/system 2>/dev/null

say "4. Scripts on disk that write there (search limited to home folders and /opt, 2 levels of matches)"
grep -rlsE --include='*.sh' --include='*.py' --include='*.js' --include='*.mjs' --include='*.ts' --include='*.php' "seo_article|public_html/insights" /home /opt /root 2>/dev/null | grep -v node_modules | head -n 20

say "5. Logins around the time the newest file was written (an upload over SSH, SFTP or FTP)"
if [ -n "$WHEN" ] && [ "$WHEN" != "?" ]; then
  H="$(date -u -d "$WHEN" +'%b %e %H:' 2>/dev/null)"
  for log in /var/log/auth.log /var/log/secure /var/log/vsftpd.log /var/log/xferlog /usr/local/hestia/log/auth.log; do
    [ -f "$log" ] && grep -H "$H" "$log" 2>/dev/null | grep -Ei 'accepted|sftp|ftp|session opened' | tail -n 10
  done
fi

say "6. Running processes that look related"
ps -eo user,pid,lstart,cmd 2>/dev/null | grep -Ei 'insight|seo|article|mewebe' | grep -v grep | head -n 10

cat <<'TXT'

== What to do with the answer
- A cron line or a script on this server: edit its prompt or config as in docs/golive/insights-brief.md. That file
  has the rules to paste: on-topic subjects, titles of 60 characters or fewer, og:image, 2 links to FlatMeta pages.
- An upload login (SSH, SFTP or FTP) from another machine: it is MeWeBe's own SEO-article pipeline. Send its owner
  docs/golive/insights-brief.md.
- Either way, the app now answers 410 (and noindex) for any off-topic article and keeps it out of the hub and the
  sitemap. Admin → Insights check lists every article that breaks a rule. Nothing more is needed here.
TXT
