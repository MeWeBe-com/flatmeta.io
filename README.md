# FlatMeta.io

FlatMeta is a shared 2D world on top of the real map. You land on the site, your avatar
appears where you are, and you can straight away:

- walk around (tap or click anywhere on the map, drag your avatar, or use the arrow keys),
- talk to anyone nearby in a Hangouts-style chat, with speech bubbles over avatars,
- claim squares of land (the first 100 are free) and put one image across them,
- give your land a name, a link like `flatmeta.io/u/your-name`, a 3-word address, a description, your own sandboxed HTML/JS or an embedded page,
- sell your land on the marketplace or buy someone else's (PayPal, 10% platform fee),
- save named pins and share links to any place.

Everything works without an account. When you want to keep your land and avatar, you
verify your email with a 6-digit code — no password needed.

The map has exactly three zoom levels: **Land** (buy and edit squares), **City** (roam and meet
people) and **World** (travel the planet). Zooming always centres on your avatar.

This repo is the web/mobile app (Ionic + Angular + Leaflet, Capacitor for iOS/Android).
The API and real-time server live in [flatmetaAPI](https://github.com/flatmeta/flatmetaAPI) (Laravel).

## Run it locally

You need Node 18+, PHP 8.1+, Composer and MySQL.

```bash
# 1. API (in the flatmetaAPI repo)
composer install
cp .env.example .env        # set DB_*, APP_URL=http://localhost:8000/, FRONTEND_URL=http://localhost:4200
php artisan key:generate
php artisan migrate
php artisan passport:install
php artisan serve --port=8000

# 2. Real-time server (second terminal, same repo)
php artisan websocket:serve --port=3500

# 3. App (this repo)
npm install
npx ng serve                # http://localhost:4200
```

To test email sign-in locally without a mail server, start the API with `MAIL_MAILER=log`;
the code then appears in `storage/logs/laravel.log`.

Production build: `npx ng build` (writes optimised files to `www/`). For the phone apps run
`npx cap sync` and open `android/` or `ios/`.

## Going live

Deployment (nginx, HTTPS, the real-time server, scheduled jobs), PayPal setup and the
sandbox test plan are in the API repo: `deploy/README.md`. What only the business can do
(keys, PayPal Payouts approval, legal details) is in `deploy/LAUNCH-CHECKLIST.md`.

Money in short: first 100 squares free; $0.10 per extra square per month by PayPal
subscription (first payment after one month); marketplace sales are one-time PayPal
payments, the seller gets 90% by PayPal Payout. Terms, Privacy and Refund pages are at
`/terms`, `/privacy` and `/refunds` (fill in the [placeholders] in `src/app/pages/legal/`).

## How the code is organised

| Where | What |
| --- | --- |
| `src/app/core/` | Pure helpers: land grid maths (`grid.ts`), avatar builder (`avatar.ts`), HTML escaping (`html.ts`) — with specs |
| `src/app/providers/session.service.ts` | Who you are: guest identity, email-code / password sign-in, profile and avatar |
| `src/app/providers/land.service.ts` | All land: loads from the API, guest drafts on the device, claim / image / details / sell / buy |
| `src/app/providers/presence.service.ts` | Real-time: avatars on the map, typing callouts, nearby chat and direct messages |
| `src/app/pages/home/` | The map page; `map/` holds the land canvas layer, avatar markers and 3-level zoom handling |
| `src/app/pages/*` | My land, marketplace, latest land, avatar & profile, connections, open source |

Rules worth knowing before you change things:

- The server is the source of truth for land. Guests' squares are drafts on their device until they verify their email; then they are saved with `ClaimTiles`.
- Anything another person can set (names, titles, image links, chat) must go through `escapeHtml` / `safeImageSrc` before it is put into HTML. Owner HTML/JS only ever runs in a sandboxed iframe.
- Only the three zoom levels in `core/grid.ts` are allowed.

## Help build it — feature list

FlatMeta is meant to be improved by its community. Pick something, open an issue to say
you're on it, and send a pull request. You can also propose and vote on changes from the
**Open source & community** page in the app.

**Live now**
- Guest-first use; email-code sign-in to save
- 100 free squares, then $0.10/square/month via PayPal subscription
- One image stretched across many squares, edge to edge; revert to the previous image
- Custom land links (`/u/…`), 3-word addresses, descriptions, sandboxed HTML/JS, embeds
- Marketplace with recent / popular / promoted filters and PayPal checkout
- Avatars with expressions from smileys, typing callouts, nearby + private chat
- Connections (friend requests), connections-only chat and avatar filters
- Saved and shared pins and positions; search for places, people, land and pins
- Leaderboard of landowners and clans; FlatMeta Home welcome plaza

**Wanted**
- Paint tools on land: markers, lines, shapes and text boxes
- Territory mini-games, clan alliances and property walls
- Saving nearby chat history on the server (direct messages are already saved)
- Phone-number verification for accounts
- Viewport-based loading of land (the API currently returns all land at once)
- Replay of past events on the map
- A how-to video (set `howToVideoUrl` in `src/environments/*.ts` to show it in the welcome popup)
- Optional NFT / on-chain land deeds

## Inspiration

[gather.town](https://www.gather.town/) (walking around and talking),
[what3words](https://what3words.com/) (shareable addresses),
[The Million Dollar Homepage](http://www.milliondollarhomepage.com/) (every square is worth something),
and Google I/O Adventure.
