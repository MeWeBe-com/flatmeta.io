# tasks.md: shared task list (single source of truth)

**How to use:** read `docs/00-kickoff-masterprompt.md` first, then pick the first unchecked task.
1. Set Owner to your agent/session name and Status to `in-progress`, then commit.
2. Do the work.
3. Tick `[x]`, set Status to `done`, then commit and push.

Status values: `todo` · `in-progress` · `done` · `blocked (reason)`. Once `docs/02-masterprompt-phase1.md` exists, it is the spec for every Phase 1 item; add section numbers in brackets.

## Phase 0: Docs
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [ ] | Audit both repos (all branches) → docs/00-audit.md | — | todo |
| [ ] | Remove committed secrets from v2 branches; list them as URGENT in progress.md | — | todo |
| [ ] | Deep research + brief → docs/01-brief.md, docs/research-notes.md | — | todo |
| [ ] | Phase 1 masterprompt → docs/02-masterprompt-phase1.md | — | todo |
| [ ] | Phase 2 masterprompt → docs/03-masterprompt-phase2.md | — | todo |
| [ ] | Expand Phase 1 tasks below with section refs from the masterprompt | — | todo |

## Phase 1: MVP (about 3 days)
| ✓ | Task | Owner | Status |
|---|------|-------|--------|
| [ ] | M1 Monorepo scaffold, typed config, .env.example | — | todo |
| [ ] | M1 DB schema + migrations (users, orgs, plots/tiles, regions, listings, orders, subscriptions, XP, quests, achievements, chat, showcase) | — | todo |
| [ ] | M1 Seed data: regions/countries, demo users, plots, listings | — | todo |
| [ ] | M2 Auth: guest-first identity, email code, password, sessions, API keys | — | todo |
| [ ] | M2 Land service: grid maths, claim, edit, image across tiles, 3-word address, /u/ links, sandboxed HTML | — | todo |
| [ ] | M2 Marketplace: list, buy, sell, platform fee, ledger | — | todo |
| [ ] | M2 Payments: Stripe checkout, subscriptions, webhooks (PayPal adapter optional) | — | todo |
| [ ] | M2 Real-time: presence, avatars, nearby + private chat, connections | — | todo |
| [ ] | M2 Game layer: XP, levels, quests, achievements, leaderboards, clans | — | todo |
| [ ] | M3 AI layer: provider adapters + plot designer (image + copy), suggestions, AI search, moderation + fallbacks | — | todo |
| [ ] | M3 Showcase system: generator for 10–20 brands per region, "unclaimed" labels, Claim-this-land flow, admin bulk approve | — | todo |
| [ ] | M3 Core tests (land maths, payments, ledger, auth, moderation) | — | todo |
| [ ] | M4 REST API + OpenAPI docs + rate limits | — | todo |
| [ ] | M4 MCP server (search/view/manage land) + tests | — | todo |
| [ ] | M5 Web: design system, map/world (MapLibre/deck.gl), 3 zoom levels, smooth avatar movement | — | todo |
| [ ] | M5 Web: onboarding + guided tour, plot editor, AI designer UI, search | — | todo |
| [ ] | M6 Web: marketplace, checkout, dashboards (user + org), game HUD, chat UI | — | todo |
| [ ] | M7 Admin panel: users, moderation queue, showcase manager, payments, settings, audit | — | todo |
| [ ] | M8 SEO: plot/region/country pages, share cards, sitemap, JSON-LD | — | todo |
| [ ] | M8 PWA, mobile-first QA, i18n-ready | — | todo |
| [ ] | M9 Worker: crons (subscriptions, showcase generation, digests, cleanup) | — | todo |
| [ ] | M10 Run showcase generator for a first batch of regions | — | todo |
| [ ] | M11 Playwright e2e smoke (guest → claim → pay → edit, showcase claim) | — | todo |
| [ ] | M11 CI workflow (ci.yml) with a final deploy job on push to v2. Do NOT use workflow_run/workflow_dispatch (they only work from main) | — | todo |
| [ ] | M11 PM2, server scripts, README + HestiaCP guide (NodeJS proxy template, configurable ports, APP_URL-based redirects) | — | todo |
| [ ] | M12 Polish: a11y, Lighthouse, copy, performance | — | todo |
| [ ] | flatmetaAPI v2: README pointing to the new monorepo | — | todo |

## Follow-ups found during the build
| ✓ | Task | Owner | Status |
|---|------|-------|--------|

## Phase 2: see docs/03-masterprompt-phase2.md. Not started.
