# Deploying FlatMeta on HestiaCP (Ubuntu 24.04)

This is the guide for the shared server: **HestiaCP** manages the domains, TLS and nginx; FlatMeta runs as an **ordinary Linux user** with **Node 22 from nvm** and **its own PM2**. No root, no Docker, no system nginx config of our own.

What runs:

| Process (PM2) | What | Port (env) |
| --- | --- | --- |
| `flatmeta-web` | Next.js (pages, share images, PWA) | `WEB_PORT` (3200) |
| `flatmeta-api` | Fastify: REST `/v1`, WebSocket `/v1/live`, `/docs`, `/openapi.json`, `/mcp`, Stripe webhook | `PORT` (3201) |
| `flatmeta-worker` | BullMQ jobs (expiry, stats, payouts, cleanup, image import) | health: `WORKER_HEALTH_PORT` (3203) |

Ports **3000, 3010 and 3100 are taken** on this server; every default here avoids them. Optional: `MCP_PORT` serves `/mcp` on its own port as well (leave empty unless you need it).

Everything is configured by **one file, `.env`, in the repo root** (copy `.env.example`). Every absolute URL, redirect, email link, sitemap entry and share card is built from **`APP_URL`**. The API refuses to start in production if `APP_URL` is `localhost`.

Config values: `APP_NAME=FlatMeta`, `PRODUCTION_DOMAIN=flatmeta.io`, `STAGING_DOMAIN=flatmeta.mewebe.net` (a placeholder until the owner confirms the staging name).

---

## 1. One-time server setup (as root in Hestia, then as the app user)

1. **Hestia:** create a user (e.g. `flatmeta`) and add the web domain (`flatmeta.io`, or `flatmeta.mewebe.net` for staging). Enable SSL with Let's Encrypt.
2. **Proxy template:** edit the domain → *Proxy Template* → choose the generic **NodeJS** template, and set its port to **3200** (the web port).
3. **Extra locations:** the template includes a per-domain `nodejs-app.conf` for extra `location` blocks. Find the exact include path in the template itself:
   ```bash
   grep -rn "include" /usr/local/hestia/data/templates/web/nginx/NodeJS.tpl /usr/local/hestia/data/templates/web/nginx/NodeJS.stpl
   ```
   Copy `deploy/hestia/nodejs-app.conf` to that path, replace `/home/USER/flatmeta` with the real checkout path, then:
   ```bash
   nginx -t && systemctl reload nginx
   ```
   If your Hestia version has no such include, put the same file in the domain's config folder as `nginx.conf_flatmeta` **and** `nginx.ssl.conf_flatmeta` (`/home/USER/conf/web/DOMAIN/`); Hestia loads files with those prefixes.
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
   Minimum for production: `NODE_ENV=production`, `APP_ENV=production` (or `staging`), `APP_URL=https://flatmeta.io`, `DATABASE_URL`, `REDIS_URL`, a long random `SESSION_SECRET` (`openssl rand -hex 32`), `COOKIE_SECURE=true`, `SEED_ADMIN_EMAIL`, SMTP settings, `MEDIA_DIR=/home/USER/flatmeta/apps/api/storage/media`, and the Stripe and AI keys when you have them. `API_INTERNAL_URL` must match `PORT` (`http://127.0.0.1:3201`).
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

Use a second checkout (`~/flatmeta-staging`) with its own `.env`: `APP_ENV=staging`, `APP_URL=https://<STAGING_DOMAIN>`, different `WEB_PORT`/`PORT`/`MCP_PORT`/`WORKER_HEALTH_PORT` (for example 3210/3211/3212/3213), its own database and a different Redis DB index (`redis://127.0.0.1:6379/1`). PM2 names get a `-staging` suffix. Create the second Hestia domain the same way, with the matching ports in its `nodejs-app.conf`. Staging shows a banner and serves `Disallow: /` in `robots.txt`.

The CI deploy job deploys the checkout in `DEPLOY_PATH`. To deploy both environments, create the secrets as **GitHub Environments** (`staging`, `production`) or point `DEPLOY_PATH` at staging until the go-live decision.

## 4. Operations

- **Logs:** `pm2 logs flatmeta-api` (also `-web`, `-worker`), `pm2 monit`.
- **Backups (cron as the app user):** `15 2 * * * cd ~/flatmeta && bash scripts/backup.sh >> ~/backup.log 2>&1` (a gzipped `pg_dump`, 14 days kept; copy off the server too, with `apps/api/storage/media`).
- **Restore:** `gunzip -c file.sql.gz | psql "$DATABASE_URL"`.
- **Stripe:** webhook endpoint `https://<APP_URL host>/api/v1/stripe/webhook` (events listed in the README).
- **Health:** API `/api/healthz` (through the proxy) or `127.0.0.1:$PORT/healthz`; worker `127.0.0.1:$WORKER_HEALTH_PORT/healthz`.

## 5. Troubleshooting

| Symptom | Check |
| --- | --- |
| 502 from nginx | `pm2 ls`; `pm2 logs`; ports in `.env` and in `nodejs-app.conf` agree |
| API exits on start: "APP_URL … not localhost" | `APP_URL` must be the public https origin in production |
| Map loads but no avatars or chat | the `/api/` location passes `Upgrade`/`Connection`; `nginx -t`; browser console shows the `/api/v1/live` handshake |
| Logged out on every request | `COOKIE_SECURE=true` needs https; the site and `/api` must share one origin |
| Share images or sitemap use the wrong host | `APP_URL`; rebuild after changing it (`bash scripts/deploy.sh`) |
| Deploy job says "skipped" | add the four `DEPLOY_*` secrets |
| `permission denied to create extension` | create the extensions as `postgres` (step 1.5) |
