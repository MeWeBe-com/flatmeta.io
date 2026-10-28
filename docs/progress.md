# Progress log

Each step appends a short summary: what was done, decisions made, what's next.

## Step 1 — Audit (2026-10-28)

**Done:** read both repos (`flatmeta.io` Ionic/Angular app, `flatmetaAPI` Laravel API), the project checklist HTML (21 phases, built from the client brief), deploy and launch docs, migrations, routes, services. Wrote `docs/00-audit.md`.

**Decisions:**
- `v2` is a clean rebuild on a new stack; legacy code remains on `main` for reference.
- Keep: the z15/40 px land grid and its maths, free starter land, one image across a plot, slugs/3-word addresses/mini-pages, guest-first email-code login, leaderboards, moderation pieces, 10% resale rule (for Phase 2).
- Drop: walking avatars and proximity chat, 3 hard zoom levels, PayPal, Ionic/Capacitor shells, PHP WebSocket server, Blade CMS.
- Product docs live in `flatmeta.io/docs/` (the API repo links to them).

**Next:** research and write `docs/01-brief.md`.

## Open questions

1. The planning gdoc (y3.0 "Logins" tab) is not in the repos. Assumed the login model stays email + one-time code (no passwords), plus optional Google sign-in.
2. The `APP_KEY` committed in the v1 `.env.example` is a real key; rotate it on any server still running v1.
