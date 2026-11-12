# Automatic deploys (cron), staging and production

Each FlatMeta checkout on the server deploys itself. A cron job runs `scripts/auto-deploy.sh --cron` every 2 minutes, as the app's Linux user (never root). When the branch has moved, it deploys the new commit, provided CI passed. Production also waits until staging has run the same commit, healthy, for 10 minutes with a passing smoke test.

| | staging | production |
| --- | --- | --- |
| checkout | `/home/flatmeta/web/staging.flatmeta.io/private/flatmeta` | `/home/flatmeta/web/flatmeta.io/private/flatmeta` |
| runs as | `najamussaqib` (owns the code and its PM2) | `najamussaqib` |
| ports web / API | 3200 / 3201 | 3250 / 3251 |
| follows | `v2` | `v2` |
| extra gate | none | the same commit live on staging for 10 min, smoke test passed |

## What a cron tick does

1. **Lock.** `flock` on `.deploy/lock`. `scripts/deploy.sh` and CI's SSH job use the same lock. A tick that finds a deploy running exits.
2. **Daily backup.** If the newest backup in `~/backups/flatmeta-<env>/` is older than 24 h, it runs `pg_dump`. Backups older than 7 days are removed (`DEPLOY_BACKUP_DAYS`). This also runs while deploys are paused.
3. **`AUTO_DEPLOY` is not `true`:** stop. Nothing else happens.
4. **`git fetch origin $DEPLOY_BRANCH`.** If the tip is the live commit (`logs/current`), stop. Staging also re-checks its health at this point, and smoke-tests a live commit it hasn't verified yet (for example one CI deployed).
5. **Tip in `logs/failed-shas`:** stop. A failed commit is never retried automatically.
6. **`REQUIRE_CI=true`:** read the commit's GitHub check runs and statuses.
   - All passed: continue.
   - Some still running: wait for the next tick.
   - Any failed: the commit goes into `logs/failed-shas`.

   It ignores CI's own `deploy`/`smoke` jobs, which run after a deploy (`DEPLOY_CI_IGNORE`). It uses the unauthenticated API, because the repository is public. The result is cached per commit in `~/flatmeta-deploy-state/`. Production checks the staging gate (step 7) before CI, so in practice only staging asks GitHub, which keeps the server well inside the 60 requests an hour per IP.
7. **Production only:** `~/flatmeta-deploy-state/staging-ok-<sha>` must exist and show all of:
   - smoke test passed;
   - healthy at staging's last check, and that check is less than 5 minutes old;
   - live there for at least `DEPLOY_STAGING_SOAK` seconds (600).

   Staging writes `staging-failed-<sha>` instead when the deploy, the health check or the smoke test fails, or when a release is rolled back by hand. Production never takes that commit.
8. **Deploy** with `scripts/deploy.sh <env> --auto --commit <sha>`:
   1. `pg_dump` before anything changes. If the backup fails, the deploy aborts with nothing changed.
   2. Check out the commit, install, build the API, and build the web app into a side directory while the old one keeps serving.
   3. Run the expand-only migrations.
   4. Swap the web build in.
   5. `pm2 startOrReload`.
   6. Health-check every `HEALTH_URLS` entry for up to 60 s. The defaults are web `http://127.0.0.1:<WEB_PORT>/` and API `http://127.0.0.1:<PORT>/v1/me`. Both must return 200, and the API must return JSON.
   7. Smoke test: `DEPLOY_SMOKE=http` (default) runs `scripts/deploy-smoke.mjs` against `APP_URL`, which covers home, robots.txt, llms.txt, the sitemap index, API health, /v1/me and /brands. `browser` runs the full Playwright smoke test (`release-smoke.cjs`, needs Chromium). `off` skips it.
9. **On any failure** (build, migrations, reload, health, smoke):
   - switch back to the previous release (code and the previous web build) and reload;
   - append the commit to `logs/failed-shas`;
   - write to the log why it failed, plus the backup path and the `pg_restore` command. The database itself is not rolled back.
10. **Email the admins** (`ADMIN_EMAILS` plus every admin user in the database), through the site's mail provider (Resend or SMTP):
    - production: every result. A success email has the commit, its subject and the duration. A rollback email has the commit, the failing step and the last 40 log lines.
    - staging: rollbacks and aborts only.

    No secrets go into emails or logs: the log contains command output only, and the database URL and tokens are never printed.

Cron mode prints nothing unless the branch moved. When it deploys, it prints one line, which cron mails to you if `MAILTO` is set.

**Files** (in each checkout, ignored by git):

| File | What it holds |
| --- | --- |
| `logs/deploy.log` | timestamped, build output included; rotated at 5 MB |
| `logs/runs/` | one log per deploy; the last 30 are kept |
| `logs/current` | the live commit |
| `logs/releases` | the last 5 good releases |
| `logs/failed-shas` | commits cron will not deploy |

## One-time setup

Run these as **najamussaqib**, in both checkouts (staging first). No root is needed, except for the nginx step at the end.

**1. Bring the scripts onto the server.**
- Staging gets them with the next CI deploy.
- Production needs one manual deploy, which asks you to type `production`:
  ```bash
  cd /home/flatmeta/web/flatmeta.io/private/flatmeta && bash scripts/deploy.sh production
  ```

**2. Check `pg_dump` and the state folder:**
```bash
pg_dump --version && mkdir -p ~/flatmeta-deploy-state && chmod 700 ~/flatmeta-deploy-state
```

**3. Add the keys to each `.env`.** Settings are read only from that file.

Staging, `/home/flatmeta/web/staging.flatmeta.io/private/flatmeta/.env`:
```bash
AUTO_DEPLOY=true
DEPLOY_BRANCH=v2
REQUIRE_CI=true
HEALTH_URLS="http://127.0.0.1:3200/ http://127.0.0.1:3201/v1/me"
DEPLOY_SMOKE=http
```

Production, `/home/flatmeta/web/flatmeta.io/private/flatmeta/.env`:
```bash
AUTO_DEPLOY=true
DEPLOY_BRANCH=v2
REQUIRE_CI=true
HEALTH_URLS="http://127.0.0.1:3250/ http://127.0.0.1:3251/v1/me"
DEPLOY_SMOKE=http
ADMIN_EMAILS=you@example.com   # optional extra recipients; admin users in the database always get the emails
```

Optional keys:

| Key | Default | What it does |
| --- | --- | --- |
| `DEPLOY_STAGING_SOAK` | `600` | seconds on staging before production takes a commit |
| `DEPLOY_STATE_DIR` | `~/flatmeta-deploy-state` | must be the same for both checkouts |
| `DEPLOY_BACKUP_DIR` | `~/backups/flatmeta-<env>` | where backups go |
| `DEPLOY_BACKUP_DAYS` | `7` | how long backups are kept |
| `GITHUB_READ_TOKEN` | – | only if the repo becomes private: a fine-grained token with read-only **Checks** and **Commit statuses** on this repository |

**4. Install the cron jobs** with `crontab -e` as najamussaqib:
```cron
*/2 * * * * bash /home/flatmeta/web/staging.flatmeta.io/private/flatmeta/scripts/auto-deploy.sh --cron
*/2 * * * * bash /home/flatmeta/web/flatmeta.io/private/flatmeta/scripts/auto-deploy.sh --cron
```

**5. Check it is running:**
```bash
bash /home/flatmeta/web/flatmeta.io/private/flatmeta/scripts/auto-deploy.sh status
```
```bash
tail -f /home/flatmeta/web/flatmeta.io/private/flatmeta/logs/deploy.log
```

**CI.**
- The staging SSH job in `ci.yml` still works. It runs `deploy.sh staging --ci v2`, which waits for a deploy cron is running, skips the commit if it is already live, and refuses a commit in `failed-shas`.
- Leave the `PROD_DEPLOY_*` secrets **unset**. Cron is the production path, and the CI production job would skip the 10-minute staging gate.

## Pause, deploy by hand, roll back

| What | How |
| --- | --- |
| Pause automatic deploys | set `AUTO_DEPLOY=false` in that checkout's `.env`. The next tick does nothing except the daily backup. Set it back to `true` to resume. |
| Deploy the branch tip now (even a commit that failed before) | `bash scripts/auto-deploy.sh` |
| Deploy one commit | `bash scripts/auto-deploy.sh --sha <commit>` |
| Back to the previous release | `bash scripts/auto-deploy.sh rollback` |
| Back to a kept release | `bash scripts/auto-deploy.sh rollback <sha>` (see `status` for the list) |
| What is live, the tip, failed commits, staging verdicts | `bash scripts/auto-deploy.sh status` |

How the manual commands behave:
- They run in the checkout's folder.
- In production they ask you to type `production`.
- A manual deploy that succeeds takes the commit off `failed-shas`.
- A rollback puts the release you left on `failed-shas`, so cron doesn't bring it straight back. On staging it also marks that release failed for production.
- All of them use the same lock as cron. If a deploy is running, they say so and stop.

**Restoring the database** (rarely needed: migrations are expand-only, so older code keeps working on the newer schema). The log names the backup:
```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" ~/backups/flatmeta-production/<file>.dump
```

## Static files and nginx

Hestia's NodeJS template serves "static" extensions (`.txt`, `.xml`, …) straight from `public_html`. So `/llms.txt` or `/robots.txt` there wins over the app, and once the file is deleted, nginx answers 404.

`deploy/hestia/nodejs-app.conf` now sends `/llms.txt`, `/llms-full.txt`, `/robots.txt` and `/sitemap-*.xml` to the app. It uses exact and `^~` locations, which beat the template's regex. `/sitemap.xml` stays static on purpose: in production it is the insights sitemap the insights automation publishes, and the app's `robots.txt` lists it next to `/sitemap-index.xml`. Installing the file needs root; the commands are in `docs/deploy-hestia.md` → "Static files in public_html" and in `RELEASE-REPORT.md`.
