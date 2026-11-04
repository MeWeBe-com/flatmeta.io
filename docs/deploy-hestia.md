# Deploying FlatMeta on HestiaCP (Ubuntu 24.04)

This is the guide for the shared server: **HestiaCP** manages the domains, TLS and nginx; FlatMeta runs as an **ordinary Linux user** with **Node 22 from nvm** and **its own PM2**. No root, no Docker, no system nginx config of our own.

What runs:

| Process (PM2) | What | Port (env) |
| --- | --- | --- |
| `flatmeta-web` | Next.js (pages, share images, PWA) | `WEB_PORT` (3200) |
| `flatmeta-api` | Fastify: REST `/v1`, WebSocket `/v1/live`, `/docs`, `/openapi.json`, `/mcp`, Stripe webhook | `PORT` (3201) |
| `flatmeta-worker` | BullMQ jobs (expiry, stats, payouts, cleanup, image import) | health: `WORKER_HEALTH_PORT` (3203) |

Ports **3000, 3010 and 3100 are taken** on this server; every default here avoids them. All three processes bind to **`HOST`** (default `127.0.0.1`), so they are reachable only through nginx, never on the server's public IP. Keep `HOST=127.0.0.1` in `.env`. Optional: `MCP_PORT` serves `/mcp` on its own port as well (leave empty unless you need it).

Everything is configured by **one file, `.env`, in the repo root** (copy `.env.example`). Every absolute URL, redirect, email link, sitemap entry and share card is built from **`APP_URL`**. The API refuses to start in production if `APP_URL` is `localhost`.

Config values: `APP_NAME=FlatMeta`, `PRODUCTION_DOMAIN=flatmeta.io`, `STAGING_DOMAIN=staging.flatmeta.io` (live staging).

---

## 1. One-time server setup (as root in Hestia, then as the app user)

1. **Hestia:** create a user (e.g. `flatmeta`) and add the web domain (`flatmeta.io`, or `staging.flatmeta.io` for staging). Enable SSL with Let's Encrypt.
2. **Proxy template:** edit the domain → *Proxy Template* → choose the generic **NodeJS** template.
3. **The two include files (both required):** the NodeJS template includes two per-domain files inside the domain's `server { }` block: `nodejs-app.conf` (extra locations) and `nodejs-app-fallback.conf` (the catch-all `location /`). Find their exact include paths in the template:
   ```bash
   grep -rn "nodejs-app" /usr/local/hestia/data/templates/web/nginx/
   ```
   Copy both files from `deploy/hestia/` to those paths:
   - `nodejs-app.conf`: `/api/` (with the WebSocket upgrade), `/media/`, `/_next/static/`, `/sw.js`. **Replace `__MEDIA_DIR__`** with the absolute value of `MEDIA_DIR` from `.env` (keep the trailing slash), e.g. `alias /home/flatmeta/flatmeta/apps/api/storage/media/;`. Until you do, every `/media/` URL returns 404 (plot images missing); `nginx -t` does not catch it, so check `grep __MEDIA_DIR__` on the installed file.
   - `nodejs-app-fallback.conf`: `location /` → Next.js on `127.0.0.1:3200`. Without it the site returns nginx errors for every page.

   If you changed `WEB_PORT`, `PORT` or `MEDIA_DIR` in `.env`, change the same values in these files. Then:

   > **Hestia only rewrites and reloads the domain's nginx config when the proxy template is (re)applied.** After creating or editing `nodejs-app.conf` / `nodejs-app-fallback.conf`, switch the domain's *Proxy Template* to `default`, save, then back to **NodeJS**, save (or run `v-change-web-domain-proxy-tpl USER DOMAIN NodeJS` as root). Running `nginx -t && systemctl reload nginx` afterwards is a good check.

   ```bash
   nginx -t && systemctl reload nginx
   ```
   If your Hestia version has no such includes, put both files' contents in the domain's config folder as `nginx.conf_flatmeta` **and** `nginx.ssl.conf_flatmeta` (`/home/USER/conf/web/DOMAIN/`); Hestia loads files with those prefixes.
4. **WebSocket check:** the file passes `Upgrade` through (`proxy_pass_header Upgrade`) because Hestia's site template hides it by default. Without it, avatars and chat won't connect (the page still works).
5. **Databases (root):** PostgreSQL 16 with `citext`, `pg_trgm`, `unaccent` and Redis 7 (Hestia can create the database; create the extensions as `postgres`):
   ```bash
   sudo -u postgres psql -d DBNAME -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;"
   ```
   Keep Redis on `127.0.0.1`. BullMQ needs `maxmemory-policy noeviction`.
6. **As the app user:** install nvm, Node 22 and PM2:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   . ~/.nvm/nvm.sh && nvm install 22 && npm install -g pm2
   pm2 startup   # prints one command: ask the server admin to run it as root so PM2 restarts on boot
   ```
7. **Code and config (app user):**
   ```bash
   git clone -b v2 git@github.com:MeWeBe-com/flatmeta.io.git ~/flatmeta && cd ~/flatmeta
   cp .env.example .env && nano .env
   ```
   Minimum for production: `NODE_ENV=production`, `APP_ENV=production` (or `staging`), `APP_URL=https://flatmeta.io`, `DATABASE_URL`, `REDIS_URL`, a long random `SESSION_SECRET` (`openssl rand -hex 32`), `COOKIE_SECURE=true`, `SEED_ADMIN_EMAIL`, `RESEND_API_KEY` and `MAIL_FROM` (see Email below), `MEDIA_DIR=/home/USER/flatmeta/apps/api/storage/media`, and the Stripe and AI keys when you have them. `API_INTERNAL_URL` must match `PORT` (`http://127.0.0.1:3201`).

   **`NODE_ENV=production` and npm:** with that set, `npm install`/`npm ci` skip devDependencies, and the build then fails (for example the shared package's `postinstall` runs `tsc` and exits with code 127, "command not found"). The build needs them. `scripts/deploy.sh` always runs `npm ci --include=dev` and exports `NPM_CONFIG_INCLUDE=dev`; keep `NPM_CONFIG_INCLUDE=dev` in `.env` (it is in `.env.example`) and use `npm ci --include=dev` for any manual install. Set `DEPLOY_PRUNE=1` only if disk is tight: it prunes devDependencies after each deploy, and then `npm run db:seed`, `npm run showcase` and other tsx scripts won't run until the next install.
8. **First deploy and seed:**
   ```bash
   bash scripts/deploy.sh v2
   npm run db:seed && npm run showcase -- --countries all --approve   # reference data, admin, HQ and the showcase plots
   ```
   `npm run setup` does migrate + seed + showcase in one go on a fresh database.

## 2. How deploys work

Pushing to `v2` runs `.github/workflows/ci.yml`: tests (Postgres + Redis services), build, end-to-end smoke tests, then a final **deploy** job, only if the tests pass. That job SSHes to the server and runs `scripts/deploy.sh`. (The deploy is a job in `ci.yml` rather than a separate workflow because GitHub only honours `workflow_run` and `workflow_dispatch` from the default branch.)

Add these **repository secrets** (*Settings → Secrets and variables → Actions*). Until they exist the deploy job prints a "skipped" notice and the run stays green:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | server host name or IP |
| `DEPLOY_USER` | the app user (e.g. `flatmeta`) |
| `DEPLOY_KEY` | the **private** key (whole file) |
| `DEPLOY_PATH` | the checkout, e.g. `/home/flatmeta/flatmeta` |
| `DEPLOY_PORT` | optional SSH port (default 22) |

Create the key pair on your own machine and put the **public** key in the app user's `~/.ssh/authorized_keys`. The server's key can use a **forced command**, so it can only run the deploy:

```
command="cd /home/flatmeta/flatmeta && bash scripts/deploy.sh v2",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA… github-deploy
```

`scripts/deploy.sh` is written for that: it loads **nvm** and `.env` itself (SSH sessions don't read your profile), exports `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, defaults to branch **v2**, installs, builds (the web app into a side directory so the running site keeps serving), migrates, swaps, reloads PM2, and **health-checks `http://127.0.0.1:$PORT/healthz` and the web port**. If the checks fail it rolls the code back to the previous commit (migrations are not reverted: fix forward or restore a backup).

Run it by hand any time: `cd ~/flatmeta && bash scripts/deploy.sh [branch]`.

## 3. Staging next to production

Staging runs the same production build (`NODE_ENV=production`) with **`APP_ENV=staging`**; if `APP_ENV` is missing with `NODE_ENV=production`, the app applies production rules (no fake checkout, no on-screen codes), so make sure staging sets `APP_ENV=staging`. On staging, without keys:

- **Sign-in:** with no email provider (`RESEND_API_KEY` and `SMTP_HOST` empty), sign-in codes are shown in the sign-in dialog and written to the API log (`DEV_CODE_ECHO=auto`). Set `RESEND_API_KEY` to switch this off; production never shows codes and won't start with `DEV_CODE_ECHO=true`.
- **Payments:** with no `STRIPE_SECRET_KEY` and `PAYMENTS_MOCK=true`, checkout goes to a fake "Pay (test)" page. Production ignores `PAYMENTS_MOCK`.
- **AI:** with no Anthropic/OpenAI/Gemini keys, the designer, suggestions, search and moderation use built-in heuristics; images use the procedural generator (`AI_IMAGE_PROVIDER=procedural`), so the showcase generator works without image keys.


Use a second checkout (`~/flatmeta-staging`) with its own `.env`: `APP_ENV=staging`, `APP_URL=https://<STAGING_DOMAIN>`, different `WEB_PORT`/`PORT`/`MCP_PORT`/`WORKER_HEALTH_PORT` (for example 3210/3211/3212/3213), its own database and a different Redis DB index (`redis://127.0.0.1:6379/1`). PM2 names get a `-staging` suffix. Create the second Hestia domain the same way, with the matching ports in its `nodejs-app.conf`. Staging shows a banner and serves `Disallow: /` in `robots.txt`.

The CI deploy job deploys the checkout in `DEPLOY_PATH`. To deploy both environments, create the secrets as **GitHub Environments** (`staging`, `production`) or point `DEPLOY_PATH` at staging until the go-live decision.

## Email (Resend)

FlatMeta sends email through [Resend](https://resend.com). Set it up once per sending domain (use `flatmeta.io` for both staging and production, or a subdomain such as `mail.flatmeta.io` to keep reputations apart):

1. **Add the domain** in Resend → *Domains* → *Add domain* (region: EU or US, close to the server).
2. **DNS in Cloudflare** (*DNS → Records*). Resend shows the exact records; copy them as shown:
   - **DKIM:** a `TXT` record named `resend._domainkey` (value starts `p=…`).
   - **SPF / return path:** an `MX` record on the `send` subdomain pointing at Resend's feedback host (priority 10), and a `TXT` record on `send` with `v=spf1 include:amazonses.com ~all`.
   - **DMARC** (recommended): `TXT` on `_dmarc` with at least `v=DMARC1; p=none; rua=mailto:dmarc@flatmeta.io`, tightened to `quarantine` once reports look clean.
   - Set all of them to **DNS only** (grey cloud). Cloudflare can't proxy MX or TXT records, and proxied CNAMEs break verification.
   - If the root domain already has an SPF record for another sender, don't add a second `v=spf1` record on the root: Resend's SPF lives on the `send` subdomain, so the root record stays as it is.
3. Press **Verify** in Resend (minutes to a few hours). Sending from an unverified domain fails with `invalid_from_address`, and the worker drops those jobs and logs an error.
4. **API key:** Resend → *API Keys* → create one with *Sending access*, limited to this domain. Put it in `.env` as `RESEND_API_KEY` (staging and production can use separate keys). Set `MAIL_FROM="FlatMeta <hello@flatmeta.io>"` (an address on the verified domain) and optionally `MAIL_REPLY_TO`.
5. **Webhook (recommended):** Resend → *Webhooks* → add `https://<APP_URL host>/api/v1/email/webhooks/resend` with the events `email.bounced` and `email.complained`. Copy its signing secret into `RESEND_WEBHOOK_SECRET`. Bounced and complained addresses are then suppressed (table `email_suppressions`; delete a row there to allow an address again).
6. Redeploy (or `pm2 restart flatmeta-api flatmeta-worker` with `--update-env`). Check: sign in on the site with your own address; the worker log shows `email sent` with the Resend id, and the email appears in Resend → *Emails* with tags `type` and `env`.

Emails are queued in Redis and sent by **`flatmeta-worker`**: if the worker is down, codes wait in the queue (its health check, `127.0.0.1:$WORKER_HEALTH_PORT/healthz`, covers the email worker too). If Redis is unreachable, the API sends inline instead.

## 4. Operations

- **Logs:** `pm2 logs flatmeta-api` (also `-web`, `-worker`), `pm2 monit`.
- **Backups (cron as the app user):** `15 2 * * * cd ~/flatmeta && bash scripts/backup.sh >> ~/backup.log 2>&1` (a gzipped `pg_dump`, 14 days kept; copy off the server too, with `apps/api/storage/media`).
- **Restore:** `gunzip -c file.sql.gz | psql "$DATABASE_URL"`.
- **Stripe:** webhook endpoint `https://<APP_URL host>/api/v1/stripe/webhook` (events listed in the README).
- **Health:** API `/api/healthz` (through the proxy) or `127.0.0.1:$PORT/healthz`; worker `127.0.0.1:$WORKER_HEALTH_PORT/healthz`.

## 5. Troubleshooting

| Symptom | Check |
| --- | --- |
| 502 from nginx | `pm2 ls`; `pm2 logs`; ports in `.env` agree with `nodejs-app.conf` and `nodejs-app-fallback.conf` |
| Every page is an nginx error but `/api/healthz` works | `nodejs-app-fallback.conf` (the `location /` catch-all) is missing |
| Next.js log shows `Network: <public IP>:3200` | `HOST` is not `127.0.0.1` in `.env`, or the app was started before the ecosystem passed `-H $HOST`. `pm2 reload` keeps an app's original start arguments, so `deploy.sh` runs `scripts/pm2-sync.cjs` first, which recreates FlatMeta apps whose start command changed. By hand: `node scripts/pm2-sync.cjs && pm2 startOrReload ecosystem.config.cjs --update-env` |
| Deploy log says "In-memory PM2 is out-of-date" | run `pm2 update` once as the app user (it restarts the PM2 daemon and keeps your apps) |
| Plot images and avatars 404 under `/media/` | the `__MEDIA_DIR__` placeholder in `nodejs-app.conf` was not replaced with your `MEDIA_DIR` (trailing slash included) |
| API exits on start: "APP_URL … not localhost" | `APP_URL` must be the public https origin in production |
| Map loads but no avatars or chat | the `/api/` location passes `Upgrade`/`Connection`; `nginx -t`; browser console shows the `/api/v1/live` handshake |
| Logged out on every request | `COOKIE_SECURE=true` needs https; the site and `/api` must share one origin |
| Share images or sitemap use the wrong host | `APP_URL`; rebuild after changing it (`bash scripts/deploy.sh`) |
| Deploy job says "skipped" | add the four `DEPLOY_*` secrets |
| `postinstall` fails with `tsc: not found` (exit 127) | `NODE_ENV=production` made npm skip devDependencies: install with `npm ci --include=dev` (deploy.sh does) and keep `NPM_CONFIG_INCLUDE=dev` in `.env` |
| Sign-in emails don't arrive | `pm2 logs flatmeta-worker`: `invalid_from_address` = `MAIL_FROM` isn't on a verified Resend domain; `invalid_api_key` = wrong key; `rate_limit_exceeded` is retried automatically. Check the address isn't in `email_suppressions` |
| `permission denied to create extension` | create the extensions as `postgres` (step 1.5) |
