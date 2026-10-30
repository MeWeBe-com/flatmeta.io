# FlatMeta API

Backend for [FlatMeta](https://flatmeta.io): REST API (`/v1`, OpenAPI 3.1), live WebSocket feed, MCP server for AI agents, background worker and the showcase generator.

**Full guide** (architecture, local dev for both apps, Ubuntu server setup, deploys, staging, Stripe, AI, backups): see the [web repo README](https://github.com/MeWeBe-com/flatmeta.io/blob/v2/README.md). Product docs, specs and the task board are in the web repo's [`docs/`](https://github.com/MeWeBe-com/flatmeta.io/tree/v2/docs) and [`tasks.md`](https://github.com/MeWeBe-com/flatmeta.io/blob/v2/tasks.md).

## Stack

Node 22 · TypeScript · Fastify 5 · Zod · Drizzle ORM · Postgres 16 (`citext`, `pg_trgm`, `unaccent`) · Redis 7 · BullMQ · Stripe · Anthropic / OpenAI / Gemini SDKs · `@modelcontextprotocol/sdk` · sharp · Vitest

## Quick start

```bash
cp .env.example .env && docker compose up -d && npm install && npm run setup && npm run dev
```

API on <http://localhost:4000>: Swagger UI at `/docs`, spec at `/openapi.json`, MCP at `/mcp`, health at `/healthz`. Without third-party keys it runs in dev mode: emails are logged, checkout is mocked, AI is heuristic and artwork is procedural.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:worker` | API / worker with reload |
| `npm run build` then `npm start` / `npm run start:worker` | Production build (`dist/`) and servers |
| `npm run db:generate` | New SQL migration from `src/db/schema.ts` (drizzle-kit) |
| `npm run db:migrate` | Apply migrations in `db/migrations` |
| `npm run db:seed` | Price tiers, countries, featured cities, admin (`SEED_ADMIN_EMAIL`), FlatMeta HQ; demo players outside production |
| `npm run setup` | migrate + seed + first showcase batch (approved) |
| `npm run showcase -- …` | Showcase generator (see below) |
| `npm run images:import` | Import images from the external pipeline inbox |
| `npm run mcp:stdio` | MCP server over stdio (Claude Desktop and similar) |
| `npm run openapi:export` | Write `openapi.json` to disk |
| `npm test` | Vitest against real Postgres (`DATABASE_URL_TEST`) and Redis (`REDIS_URL_TEST`, or DB 15) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

## Layout

```
src/
  app.ts, server.ts, worker.ts   Fastify app, HTTP entry, BullMQ worker entry
  config.ts                      Zod-validated env (see .env.example)
  db/                            Drizzle schema, client, migrator   (SQL in db/migrations)
  routes/                        auth, me, plots, regions, social, search, orgs, billing, ai, showcase, admin, live
  services/                      plots (quote, claim, holds), billing (Stripe), moderation, showcase claims
  game/                          XP, levels, quests, achievements, leaderboards, activity
  ai/                            text, images (procedural/openai/gemini/external), designer, search, moderation
  mcp/                           MCP tools and resources (HTTP + stdio)
  showcase/                      generator, CLI, external image import
  jobs/                          scheduled maintenance jobs
  lib/                           grid, geo, pricing, auth, storage, mail, redis …
seed/                            seed script + curated showcase JSON per country
deploy/                          nginx configs (production, staging template)
scripts/                         deploy.sh, backup.sh, export-openapi.ts
test/                            unit + API integration tests
```

## Showcase generator

Showcase plots use an organisation's **name only** with **original generated artwork**: no logos, no implied endorsement. They are always labelled as unclaimed and not affiliated, and are hidden until approved.

```bash
npm run showcase -- --countries GB,US --approve
```

```bash
npm run showcase -- --countries IT --source ai --count 12
```

```bash
npm run showcase -- --countries GB --source ai --names "Example Museum,Example FC"
```

```bash
npm run showcase -- --countries all --images gemini --regenerate-images
```

Options: `--countries` (ISO codes or `all`), `--source curated|ai`, `--count`, `--names`, `--images procedural|openai|gemini|external`, `--approve`, `--force` (overwrite edited content), `--regenerate-images`. Runs are idempotent: plots are keyed by a slug from name and country, existing ones are left alone unless you pass `--force` or `--regenerate-images`, and placement never overlaps other land. The same controls are in the web admin under **Admin → Showcase**.

**External images (Google Flow etc.):** with `--images external` (or `AI_IMAGE_PROVIDER=external`), prompts go to `EXTERNAL_IMAGE_DIR/outbox/prompts.jsonl`. Save each result as `EXTERNAL_IMAGE_DIR/inbox/<id>.png`; the worker imports them hourly, or run `npm run images:import`.

## Deploy

`.github/workflows/deploy.yml` deploys over SSH using the `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` and `DEPLOY_PATH` secrets, and skips while they are unset. Push to `v2` deploys staging; run the workflow manually to pick `production`. On the server, `scripts/deploy.sh` builds, migrates, reloads PM2 (`flatmeta-api`, `flatmeta-worker`, with a `-staging` suffix for staging), health-checks and rolls back the code on failure.
