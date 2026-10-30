# tasks.md: shared task list (single source of truth)

**How to use:** read `docs/00-kickoff-masterprompt.md` first, then pick the first unchecked task.
1. Set Owner to your agent/session name and Status to `in-progress`, then commit.
2. Do the work.
3. Tick `[x]`, set Status to `done`, then commit and push.

Status values: `todo` · `in-progress` · `done` · `blocked (reason)`. Once `docs/02-masterprompt-phase1.md` exists, it is the spec for every Phase 1 item; section numbers are in brackets (§12 is the kickoff alignment and wins over earlier sections).

Owner `claude` = Claude Code cloud session `01LEq4cqBwnNj9v3GR8k2J4p`.

> **Push status:** the Claude GitHub App has no write access to `MeWeBe-com/*`: `git push` and the GitHub API both return 403. Commits are kept on local `v2` (with git bundles as a backup); see `docs/progress.md` → Open questions.

## Phase 0: Docs
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [x] | Audit both repos (all branches) → docs/00-audit.md | claude | done (§8 covers the extra branches) |
| [x] | Remove committed secrets from v2 branches; list them as URGENT in progress.md | claude | done (one: v1 `APP_KEY`; not present on v2) |
| [x] | Deep research + brief → docs/01-brief.md, docs/research-notes.md | claude | done (§13 aligns it with the kickoff) |
| [x] | Phase 1 masterprompt → docs/02-masterprompt-phase1.md | claude | done (§12 kickoff alignment) |
| [x] | Phase 2 masterprompt → docs/03-masterprompt-phase2.md | claude | done (scope note added) |
| [x] | Expand Phase 1 tasks below with section refs from the masterprompt | claude | done |

## Phase 1: MVP (about 3 days)
Status note: milestones M1–M12 were first built **before** the kickoff file was visible, as two repos. Rows marked *(rework)* are built but must change to match the kickoff (monorepo, ports, `APP_URL`); rows marked *(new)* were missing.

| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [ ] | M1 Monorepo scaffold (`apps/web`, `apps/api`, `packages/shared`), typed config, root `.env.example`, `APP_URL`/`STAGING_DOMAIN`/port env, flatmetaAPI pointer [§12.1] *(rework)* | claude | todo |
| [ ] | M1 DB schema + migrations (users, orgs, plots/tiles, regions, listings, orders, subscriptions, XP, quests, achievements, chat, showcase) [§3, §12.3–12.5]. Built: all except `listings`, `ledger_entries`, `connections`, `chat_messages`, `clans*`, `users.avatar/password_hash` *(new)* | claude | todo |
| [x] | M1 Seed data: regions/countries, demo users, plots (listings come with the marketplace task) | claude | done |
| [ ] | M2 Auth: guest-first identity, email code, password, sessions, API keys [§12.1]. Built: all except the optional password *(new)* | claude | todo |
| [ ] | M2 Land service: grid maths, claim, edit, image across tiles, 3-word address, /u/ links, sandboxed HTML [§2, §12.6]. Built: all except `/u/` redirect and sandboxed custom HTML *(new)* | claude | todo |
| [ ] | M2 Marketplace: list, buy, sell, platform fee, ledger [§12.4] *(new)* | — | todo |
| [ ] | M2 Payments: Stripe checkout, subscriptions, webhooks (PayPal adapter optional) [§12.4]. Built: Stripe, mock; provider interface to add | claude | todo |
| [ ] | M2 Real-time: presence, avatars, nearby + private chat, connections [§12.3]. Built: online count and live activity only *(new)* | — | todo |
| [ ] | M2 Game layer: XP, levels, quests, achievements, leaderboards, clans [§2.4, §12.5]. Built: all except clans *(new)* | claude | todo |
| [x] | M3 AI layer: provider adapters + plot designer (image + copy), suggestions, AI search, moderation + fallbacks [§5] | claude | done |
| [x] | M3 Showcase system: generator for 10–20 brands per region, "unclaimed" labels, Claim-this-land flow, admin bulk approve [§2.5] (140 plots, 14 per country, 10 countries) | claude | done |
| [ ] | M3 Core tests (land maths, payments, ledger, auth, moderation) [§9]. Built: 32 API tests; ledger, chat, clans tests to add | claude | todo |
| [x] | M4 REST API + OpenAPI docs + rate limits [§4] | claude | done |
| [x] | M4 MCP server (search/view/manage land) + tests [§6.1] | claude | done |
| [ ] | M5 Web: design system, map/world (MapLibre/deck.gl), 3 zoom levels, smooth avatar movement [§7, §12.2–12.3]. Built: design system, globe map, smooth zoom; zoom-level control and avatars to add | claude | todo |
| [x] | M5 Web: onboarding + guided tour, plot editor, AI designer UI, search | claude | done |
| [ ] | M6 Web: marketplace, checkout, dashboards (user + org), game HUD, chat UI [§12.3–12.5]. Built: checkout, dashboards, HUD; marketplace, clan and chat UI to add | claude | todo |
| [x] | M7 Admin panel: users, moderation queue, showcase manager, payments, settings, audit (marketplace and clan admin to add under the marketplace task) | claude | done |
| [x] | M8 SEO: plot/region/country pages, share cards, sitemap, JSON-LD [§6.2] | claude | done |
| [x] | M8 PWA, mobile-first QA, i18n-ready [§7.4] | claude | done |
| [x] | M9 Worker: crons (subscriptions, showcase generation, digests, cleanup) [§8] (marketplace payouts and chat cleanup join under their tasks) | claude | done |
| [x] | M10 Run showcase generator for a first batch of regions | claude | done |
| [ ] | M11 Playwright e2e smoke (guest → claim → pay → edit, showcase claim). Built: 4 smoke specs (map, plot page, pricing, sitemap); the full flows to add | claude | todo |
| [ ] | M11 CI workflow (ci.yml) with a final deploy job on push to v2. Do NOT use workflow_run/workflow_dispatch (they only work from main) [§12.7]. Built: separate `deploy.yml` with `workflow_dispatch` *(rework)* | claude | todo |
| [ ] | M11 PM2, server scripts, README + HestiaCP guide (NodeJS proxy template, configurable ports, APP_URL-based redirects) [§12.7]. Built: PM2, scripts and an nginx guide *(rework to Hestia)* | claude | todo |
| [ ] | M12 Polish: a11y, Lighthouse, copy, performance | — | todo |
| [x] | flatmetaAPI v2: README pointing to the new monorepo (`V2.md`, added by the owner) | owner | done |

## Follow-ups found during the build
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [ ] | End-to-end Stripe test-mode run with real keys (tested so far: mock checkout and signed webhook payloads) | — | todo |
| [ ] | Verify curated showcase coordinates in admin (written from memory; some may sit a few blocks off) | — | todo |
| [ ] | Self-host map tiles (PMTiles) and the geocoder before heavy traffic | — | todo |
| [ ] | Translate `messages/en.json` when a second locale is chosen | — | todo |
| [ ] | Owner: rotate the v1 Laravel `APP_KEY` (URGENT, see progress.md) | owner | todo |
| [ ] | Owner: grant the Claude GitHub App write access to `MeWeBe-com/flatmeta.io` and `flatmetaAPI` | owner | blocked (403 on push) |
| [ ] | Owner: set `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH` (and optional `DEPLOY_PORT`) repo secrets | owner | todo |
| [ ] | Owner: confirm `STAGING_DOMAIN` (placeholder `flatmeta.mewebe.net`), Stripe products/webhook, AI keys, SMTP, DNS | owner | todo |
| [ ] | Owner: legal review and fill `[COMPANY NAME]`, `[COUNTRY]`, `[CONTACT EMAIL]` in the legal pages | owner | todo |

## Phase 2: see docs/03-masterprompt-phase2.md. Not started.
