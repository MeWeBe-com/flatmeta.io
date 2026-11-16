# Cloudflare Workers for FlatMeta (GL6)

| Worker | What it does | Why the edge helps |
|---|---|---|
| `edge/` (`flatmeta-edge`) | Resizes plot images and covers by `?w=` (WebP or AVIF, never upscaled) and caches them for a year; caches sitemaps, `llms.txt` and `robots.txt` for 10 minutes. HTML pages pass straight through. | Phones get small images from the nearest data centre; crawlers never wait on the origin. HTML isn't cached because every page carries a per-request CSP nonce and signed-in state. |
| `uptime/` (`flatmeta-uptime`) | Every 5 minutes checks `/api/v1/health` and `/` on www and staging; posts to a webhook when one goes down or comes back; warms the sitemap daily. | It runs outside the server, so it still alerts when the server, nginx or the network is down. |

**Deploy** (who: Fahad or the owner, in the boss's main Cloudflare account; the zone `flatmeta.io` must be on it):
1. Create an API token: Cloudflare → My Profile → API Tokens → **Create token**, template "Edit Cloudflare Workers", named `FlatMeta-Workers`, limited to the flatmeta.io zone and the account.
2. On any machine with Node 22, in a shell (never in a file):
   ```bash
   export CLOUDFLARE_API_TOKEN=…
   export CLOUDFLARE_ACCOUNT_ID=…
   ```
3. Edge worker:
   ```bash
   cd ops/cloudflare/edge && npx wrangler@4 deploy
   ```
   Then **Speed → Optimization → Image Resizing**: turn it on (or set `IMAGE_RESIZING = "off"` in `wrangler.toml` to only cache).
4. Uptime worker:
   ```bash
   cd ops/cloudflare/uptime && npx wrangler@4 kv namespace create UPTIME
   ```
   Put the printed id in `wrangler.toml`, then run:
   ```bash
   npx wrangler@4 secret put ALERT_WEBHOOK_URL
   ```
   Paste the Slack, Discord or Google Chat webhook when asked. Then deploy:
   ```bash
   npx wrangler@4 deploy
   ```
5. Check:
   - `curl -sI "https://www.flatmeta.io/api/v1/plots/flatmeta-hq/cover.jpg?w=480"` shows `cf-cache-status` (a HIT on the second request) and a WebP/AVIF `content-type` when Accept allows it;
   - `curl -sI https://www.flatmeta.io/sitemap.xml` shows `cache-control: public, max-age=600, s-maxage=600`.

The routing logic is unit-tested in `apps/web/test/unit/workers.test.ts`.
