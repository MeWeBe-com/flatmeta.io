# 00 — Audit of FlatMeta v1

*Date: 2026-10-28 · Branch audited: `main` of `MeWeBe-com/flatmeta.io` (app) and `MeWeBe-com/flatmetaAPI` (backend) · Author: lead engineer (Claude)*

Sources read: both READMEs, `FlatMeta_PROJECT_CHECKLIST.html` (the 21-phase plan built from the client brief, with 200+ tasks), `deploy/README.md`, `deploy/LAUNCH-CHECKLIST.md`, `deploy/HESTIACP.md`, every migration, the route files, the main controllers and services (`OrdersController`, `Billing`, `PayPal`, `WebSocketServer`), and the Angular app (`home.page.*`, `land.service.ts`, `core/grid.ts`, `core/avatar.ts`, providers, pages). The original planning gdoc (y3.0 "Logins" tab) is **not** in either repo; where it would have answered something, the assumption is marked **[ASSUMPTION]**.

---

## 1. What FlatMeta is, and what it set out to do

FlatMeta is a **shared 2D world drawn on top of the real map**. A visitor lands on the site, an avatar appears at their location, and they can:

- walk around (click/tap, drag, arrow keys) and see other people's avatars live,
- chat with anyone nearby (speech bubbles, Hangouts-style panel) or privately with connections,
- **claim squares of land** on a fixed grid and stretch one image across them,
- give their land a name, a custom URL (`flatmeta.io/u/name`), a 3-word address, a description, sandboxed HTML/JS or an embed,
- sell land on a marketplace (10% platform fee),
- save and share pins and positions.

The client brief (dated entries from 31/03/22 to 06/01/23, summarised in the checklist) describes an **open-source, collaborative "2D metaverse"** inspired by gather.town (walking and talking), what3words (shareable addresses), the Million Dollar Homepage (every square is worth something) and Google I/O Adventure. "Later" ideas in the brief: paint tools on land, group chat, land challenges/takeovers, clans and battles, mini adventures, replays, a developer portal with community-voted code, and optional NFT/on-chain deeds.

The commercial idea was simple: **the first 100 squares are free, then $0.10 per square per month** by PayPal subscription, plus a **10% cut of marketplace resales**.

## 2. Current stack

| Layer | v1 technology | Notes |
| --- | --- | --- |
| App | Ionic 9 + Angular 22 (standalone), Leaflet 1.7, leaflet-geosearch, Quill, Capacitor 8 (iOS/Android) | Upgraded in Oct 2026 from Angular 15 in one day of `ng update` hops. Package name is still `leafletmap`. |
| API | Laravel 13 (PHP 8.3), Sanctum tokens, MySQL | Upgraded from Laravel 8 in Oct 2026. Blade admin CMS (bootstrap theme). |
| Realtime | Custom PHP WebSocket server (`php artisan websocket:serve`, 618 lines) behind nginx `/ws`, supervised | Replaced an earlier Node/Socket.io server (`index.js`, still in repo as "legacy"). |
| Payments | PayPal REST v2: Subscriptions (rent), Orders (resale), Payouts (seller share), webhooks | Hand-written client `app/Services/PayPal.php`, money rules in `app/Services/Billing.php`. |
| Hosting | nginx + PHP-FPM + supervisor + cron on Ubuntu, or HestiaCP; app built to static `www/` | Two hosts: `flatmeta.io` and `api.flatmeta.io`. |
| Tests | PHPUnit (API token + billing with a faked PayPal); Jasmine specs for `grid`, `html`, `avatar` | No CI, no E2E. |

## 3. Data model (MySQL)

| Table | Purpose | Problems |
| --- | --- | --- |
| `users` | fullname, username, email, password, image, `avatar_config` (JSON text), `clan`, `phone`, `paypal_email`, `is_admin`, hashed 6-digit `verification_code` + expiry + attempts, `status` enum('1','2','3') | Magic-number enums; `username` not unique; password required even though login is email-code. |
| `orders` | One "area" of land per row: `user_id`, `name`, `no_of_tiles` (string!), `amount` (string), `custom_details` (JSON text: slug, 3 words, description, HTML, embed), `sale_price`, `on_sale` enum, `status` enum('0' reserved,'1' active,'2' released), subscription id/status, `center_lat/lng` | Numbers stored as strings; JSON blobs in text; an "order" is really a plot. |
| `user_boxes` | One row per square: `order_id`, `lat`, `lng` (strings), `lat_num`/`lng_num` decimals (added later for bbox queries), `image`, `previous_image`, `span_bounds` | No uniqueness on the square, so double-sales are only prevented in application code; floats as identity. |
| `order_histories` | Snapshot of an order when it changes hands | |
| `carts` | Squares in a cart | Unused by the current claim flow. |
| `payments`, `paypal_events` | Ledger of subscriptions, sales, payouts, refunds; webhook idempotency | Reasonably designed. |
| `user_followers` | Friend requests (`status` enum) — doubles as chat room id | |
| `chats` | Direct messages keyed by `user_followers.id` | Nearby chat is not stored. |
| `images` | Country-flag image library (`ad.svg` …) for "default artwork" | |
| `report_texts`, `user_reports` | Report reasons and reports | |
| Community proposals | Stored in a **JSON file** under `storage/` | Not in the database. |

**Grid** (`src/app/core/grid.ts`): land is a fixed grid of **40×40 px squares at Web-Mercator zoom 15**. Each square has integer coordinates `(gx, gy)`; the stored lat/lng is the north-west corner. At the equator a square is ≈191 m wide; in London ≈119 m. There are ~4.4×10¹⁰ squares on Earth. This is clean, deterministic and worth keeping.

## 4. API surface (v1)

All under `/api`, PascalCase verbs, no versioning, inconsistent JSON envelopes:

- **Auth:** `POST /login`, `/register`, `/VerifyEmail` (email + 6-digit code), password reset trio. Throttled 10/min.
- **Land (public):** `GET /PurchasedTiles?bbox=…[&summary=1]`, `/GetUserTilesByOrderId/{id}`, `/BoxImages`, `/SaleList`, `/LatestPurchasedTiles`, `/FindArea`, `/Leaderboard`, `/CommunityProposals`, `POST /GetAllUser` (public dump of users — flagged S13 in the old audit).
- **Land (auth):** `/ClaimTiles`, `/BuyNow`, `/UpdateCustomDetails`, `/UpdateSalePrice`, `/MyPlaces`, `/ReleaseOrder`, `/UpdateBoxImage`, `/RevertBoxImage`, `/UploadBoxesImage`, `/BuyMarketplaceOrder`, `/StartBilling`, `/MyPayments`.
- **Social:** friend requests, rooms, messages, reports, community proposals and votes.
- **Webhooks:** `POST /paypal/webhook` (signature-verified).
- **Admin (Blade, session auth):** users, subscriptions/tiles (revert/revoke), payments (retry payouts), report texts, user reports.
- **Realtime:** `wss://api.flatmeta.io/ws` — location, typing, nearby and direct chat.

No OpenAPI spec, no API keys for third parties, no MCP.

## 5. Current features (what actually works on `main`)

1. Guest-first use: avatar appears immediately; land claims are stored as **drafts in `localStorage`** until the guest verifies an email with a 6-digit code.
2. Three hard zoom levels (World z5 / City z10 / Land z15); wheel and pinch are converted to one step per gesture.
3. Buy mode: tap squares to select; first 100 free; more triggers a PayPal subscription at $0.10/square/month.
4. One image stretched across many squares; revert to previous image; flag library as default artwork.
5. Area details: name, custom slug, 3-word address, description, sandboxed HTML/JS, embed.
6. Marketplace: list for sale, recent/popular/promoted filters, PayPal checkout, automatic 90% payout, auto-refund if the listing changed.
7. Realtime avatars with expressions (smileys change the face), typing callouts, nearby and direct chat.
8. Connections (friend requests), report users, "Scan" (outline owners), "Peek map", pins, share position link.
9. Leaderboard of landowners and clans; FlatMeta Home welcome plaza; community proposals and voting page.
10. Legal pages (Terms, Privacy, Refunds) with `[COMPANY NAME]` placeholders.
11. Blade admin CMS; scheduled jobs (`billing:enforce`, payout retries); deployment guides for nginx and HestiaCP.

## 6. What is clunky, limited or broken

### 6.1 UX (the biggest problem)

- **No reason to come, no reason to stay.** The first screen is a street map with an avatar and a long toolbar (`Buy land`, `Scan`, `Peek map`, `Pins`, `Ranks`, `Save`). There is no goal, no progression, no reward, and nothing interesting to look at because the world is empty. An empty world is exactly what killed engagement in Decentraland and The Sandbox.
- **Three hard zoom levels feel broken on a modern map.** Users expect smooth zoom (Google Maps, Apple Maps). Snapping z5 → z10 → z15 disorients ("zoomed out in London, ended up in China" is in the brief) and makes browsing a region or country impossible.
- **The square is tiny and featureless.** One 40 px square at z15 is ~120–190 m; land is only visible at one zoom level, so the "Million Dollar Homepage" wow (a dense mosaic of everyone's images) never appears.
- **Selection is tap-per-square.** Claiming a 10×10 area means 100 taps. Drag-to-select was planned but not built.
- **Too many modals.** Artwork, editor, area, pins, ranks and report are all `ion-modal`s over the map; the bottom dock (FlatMeta, FlatMeta Home, On Sale, My Land, Menu) and the top pill row compete for attention on mobile.
- **"Metaverse" framing and avatars-in-chat** put the product in the gather.town / Second Life category, where it can't win, rather than in "own a piece of the map", where it can.
- **Pricing is confusing.** "Free for 100 squares, then 10 cents per square per month, billed by PayPal a month later" is hard to reason about and creates a recurring bill for a novelty.
- **No public, indexable pages.** Land pages are client-rendered inside the SPA, so they don't rank or preview well when shared. Growth by search and social is impossible.
- **Visual design** is a generic dark "glass" Ionic theme. Not stunning, not game-like.
- **Accessibility**: canvas-only land, icon-only buttons in places, and modals without focus management on several pages.

### 6.2 Product and business

- No business, brand or organisation accounts; no reason for a company to pay.
- No content at launch: an empty map. FlatMeta Home is the only seeded area.
- Marketplace resale depends on **PayPal Payouts** being approved for the business account (launch checklist item still open), and invites speculation.
- Open-source framing ("help build it") with no community yet adds overhead without traffic.
- No analytics, no SEO, no sharing loop beyond copying a link.

### 6.3 Engineering

- **Data integrity:** squares are identified by lat/lng strings; there is no database-level uniqueness on a square, so double-claims are prevented only in PHP. Money and counts stored as strings. JSON-in-text columns everywhere.
- **API design:** PascalCase RPC routes, no versioning, inconsistent responses, a public user dump (`POST /GetAllUser`), controller methods of 100+ lines (`OrdersController` is 803 lines).
- **Frontend:** `home.page.ts` is 1,259 lines and `land.service.ts` 1,107 lines; Leaflet with a custom canvas layer; framework upgraded seven major versions in one day with old lint tooling (`@angular-eslint` 15, `eslint` 7) left behind.
- **Realtime:** a hand-written PHP WebSocket server is a single process with in-memory state; it cannot scale horizontally and has to be supervised separately.
- **Ops:** no CI, no automated deploy, no error tracking, no metrics, no backups automation; secrets were committed in `.env.example` (`APP_KEY=base64:…` is a real key and should be considered burnt).
- **Security (from the October 2026 audit, S1–S15):** most critical items were addressed on `main` (hashed codes, Sanctum, signed PayPal webhooks, sandboxed owner HTML), but S13 (public user list) is still routed, and the WebSocket server is the weakest component.

## 7. What is worth keeping

| Keep | Why | How v2 uses it |
| --- | --- | --- |
| **The grid** (`grid.ts`: 40 px @ z15, integer `(gx, gy)`, Web-Mercator maths, 3-word default addresses) | Deterministic, global, cheap to index; every square has a stable id | Ported to TypeScript in the API (`src/lib/grid.ts`) and the web app. Squares are called **cells**; a **plot** is a rectangle of cells. DB enforces one owner per cell with a unique `(gx, gy)` index. |
| **Free starter land** | Strongest acquisition hook in the old plan | Every verified user gets a free **Homestead** plot (up to 4 cells). |
| **One image across many squares** | It's the "Million Dollar Homepage" moment | A plot has one cover image stretched across its rectangle, rendered on the map. |
| **Custom slug, 3-word address, description, links, embed** | Plots as shareable mini-pages | Plot mini-page at `flatmeta.io/p/<slug>` with SEO and share cards. |
| **Guest-first, email-code sign-in** | Low friction | Explore everything as a guest; one-time email code (no password) to claim. |
| **Leaderboard, clans, pins, "Scan" outline, FlatMeta Home** | Seeds of the game layer | Leaderboards, guilds (Phase 2), saved places, ownership overlay, a FlatMeta HQ showcase plot. |
| **Moderation pieces** (report reasons, admin revert/revoke) | Needed at scale | Reports queue + AI moderation + admin actions. |
| **10% marketplace commission, refund-if-listing-changed rule, idempotent webhook ledger** | Sound money rules | Carried into Phase 2 marketplace (on Stripe Connect instead of PayPal Payouts). |
| **Country list** (`public/assets/countries.json`, flag library) | Region data | Replaced by ISO 3166 data + country polygons; flags kept as emoji. |
| **Copy** ("Own a piece of the map", "every square is worth something", the welcome text, how-it-works bullets) | Clear, friendly tone | Reused and tightened in the new onboarding. |
| **Legal page skeletons** (Terms, Privacy, Refunds) | Placeholders are still needed | Ported with the same `[COMPANY NAME]` placeholders (see Open questions). |
| **Deployment knowledge** (nginx, certbot, supervisor/cron, HestiaCP notes) | Same Ubuntu server | v2 README uses nginx + PM2 + cron/workers. |

What we **drop**: avatars walking on the map and proximity chat (expensive realtime with low value; replaced by lighter "explorers online" presence, live activity feed, guestbooks and neighbour waves), hard 3-level zoom, PayPal (replaced by Stripe), Ionic/Capacitor native shells (replaced by a PWA; native shells can return later), the PHP WebSocket server, the Blade CMS, NFT ideas.

**Legacy code stays on `main`** in both repos; `v2` is a clean rebuild.

---

## 8. The other branches (public repos `flatmeta/flatmeta.io` and `flatmeta/flatmetaAPI`)

Added 2026-10-30 from the owner's request to read every branch. All of these branch tips are **ancestors of `main`**: nothing unique lives on them, they are the stepping stones that led to the current `main`. They matter because they record *why* things are built the way they are.

| Repo | Branch (tip date) | What it did | What v2 takes from it |
| --- | --- | --- | --- |
| web | `refactor/brief-alignment` (16 Oct) | Replaced a 1,900-line `MetaverseService` (land, friends, chat in `localStorage`, with bots and fake listings) with focused services (`Session`, `Land`, `Presence`, `Friends`, `Pins`, `Settings`, `Payment`). One route serves every map URL (`/`, `/u/:slug`, `/at/:coords`, `/p/:pin`). **Strict 3 zoom levels**; first visit goes to the real location (GPS, then IP). All user text escaped (fixed an XSS via avatar names). Guest land is a device draft saved on sign-in. Tap/click walks the avatar; double-click walks in Buy mode. | The service split, the "one map instance, many URLs" idea, guest drafts, the real-location start, escaping rules. The kickoff brief keeps the 3 zoom levels, so v2 must make them **smooth presets** on top of continuous zoom, not hard snaps. |
| web | `launch-payments` (20 Oct) | Rent status on "My land", PayPal payout email on the profile, a thank-you page with the real PayPal result, legal pages with `[COMPANY NAME]` placeholders, Capacitor 8 phone builds (`@capacitor/browser`, no cleartext HTTP). | Legal text, payout email, thank-you states. Native wrappers return in Phase 2 (Capacitor). |
| api | `viewport-land-loading` (16 Oct) | `PurchasedTiles?bbox=…` capped at 5,000 squares, a one-row-per-area summary for zoomed-out levels, indexed numeric `lat_num`/`lng_num`, and a `tiles_updated` WebSocket notice carrying the changed bounds. | The same idea, done properly: integer `(gx, gy)` cells with a primary key, bbox queries by cell range, and a live notice per changed rectangle. |
| api | `remove-test-uploads` (16 Oct) | Deleted test uploads from `public/assets/uploads`. | Nothing to port; v2 stores media outside the repo. |
| api | `upgrade/laravel-12`, `upgrade-wip` (20 Oct) | Laravel 8 → 12, Passport 10 → 13 (UUID client ids had to be turned off so existing personal access tokens kept working), PHPUnit 11, Passport migrations, lock file resolved for PHP 8.2. | Confirms v1 now runs on Laravel 12; v1 is frozen on `main`. |
| api | `launch-payments` (20 Oct) | End-to-end PayPal: rent by subscription ($0.10/square/month), marketplace by one-time checkout (buyers were once charged the sale price monthly), a 90% seller payout by PayPal Payouts with retries, de-duplicated signed webhooks, a `billing:enforce` job (release unpaid reservations after 24 h; release land whose rent lapsed 7 days after the paid period), 25 feature tests against a faked PayPal, a launch checklist. | **Marketplace money rules** (10% fee, refund when a listing changes mid-checkout, ledger, idempotent webhooks, payout retries) move to Phase 1 on Stripe Connect, with a PayPal adapter kept optional. The launch checklist becomes the v2 owner-actions list. |
| api | `develop` (20 Oct) | One commit on `main`: the HestiaCP guide must let the WebSocket `Upgrade` header through (Hestia's template sets `proxy_hide_header Upgrade`). | Applies to v2's live WebSocket: the Hestia proxy template in `deploy/hestia/` must pass `Upgrade`/`Connection`. |

`flatmeta/flatmeta.io` also has `develop` (identical to `main` minus one "Ship an `.htaccess`" commit).

**Correction to §5 and §6 above:** the audit was written as if marketplace, nearby/private chat, connections and clans were things to drop. The owner's kickoff brief (`docs/00-kickoff-masterprompt.md`) keeps them in Phase 1, so v2 must include them, with the lighter implementation the audit proposed (WebSocket presence on Redis, not a single in-memory PHP process).

## 9. Committed secrets

A scan of every branch tip and the full history of both repos (private-key blocks, cloud and payment key patterns, `*_SECRET`/`*_PASSWORD`/`*_TOKEN` assignments, `.env` and key files, SQL dumps) found **one** credential:

| Where | What | Status |
| --- | --- | --- |
| `flatmetaAPI` `.env.example` line 3, introduced in commit `363faab`, present on every v1 branch | `APP_KEY=base64:ah1EUh…` (a real Laravel key; it signs cookies and encrypts values) | **URGENT: rotate on any server that ever used it** (`php artisan key:generate`; this logs everyone out). Removed from `v2` (the file no longer exists there). Still in git history; rewriting v1 history is the owner's call. |

Nothing else was found: no PayPal keys, no private keys, no database dumps, no mobile signing material. `.env.production.example` and the PayPal config use placeholders. v2 ships only `.env.example` files with empty values.
