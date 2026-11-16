# 16 Nov Go Live: manual steps

Everything here needs a person: a purchase, an account, a key, a DNS record or a signature. Everything else is done in the repo. Each step says **who** does it and **how to check it worked**.

**Who's who:**
- **Owner:** the FlatMeta project owner.
- **Boss:** the Organisation admin (Stripe Organisation, main Cloudflare account, MeWeBe).
- **Fahad:** buys domains in the boss's main Cloudflare account (top-left account switcher).
- **Server admin:** root on cp2.

**Never paste a key into chat, a ticket or a commit.** Keys go only into the server's `.env` (or the provider's own dashboard).

---

## Domains (GL1)

**1. Buy `flatmeta.com` (who: Fahad, in the boss's main Cloudflare account).**
1. Cloudflare dashboard → top-left account switcher → the boss's main account → **Domain Registration → Register Domains**.
2. Search `flatmeta.com`. It was unregistered on 16 Nov 2026 by RDAP; if Cloudflare shows a premium price, stop and ask the boss.
3. Buy it for 1 year with **auto-renew on**. It costs about $10.
4. Optional, only if the UK is a sales focus: `flatmeta.co.uk`. Same steps.
5. Check: `bash scripts/rdap-check.sh flatmeta.com` now says "registered".

**2. Redirect it to the live site (who: Fahad or the owner, in the same Cloudflare account).**
1. `flatmeta.com` → **DNS** → add `A @ 192.0.2.1` and `CNAME www flatmeta.com`, both **Proxied** (orange cloud). The IP is a placeholder: Cloudflare answers the redirect before any server is reached.
2. **Rules → Redirect Rules → Create rule:** "All incoming requests" → **Dynamic** → expression `concat("https://www.flatmeta.io", http.request.uri.path)` → **301**, preserve query string ✓.
3. Check: `curl -sI https://flatmeta.com/pricing?x=1` → `301` and `location: https://www.flatmeta.io/pricing?x=1`.

**3. Keep `flatmeta.io` safe (who: whoever holds the flatmeta.io registrar account).** Turn **auto-renew** on. It expires 2027-04-21. Turn on the registrar lock and 2FA on the registrar account.

**4. Trademark check before filing (who: owner, 10 minutes).** Search the word "FLATMETA", and "FLAT META" with the gap, in:
- UKIPO: https://trademarks.ipo.gov.uk/ipo-tmtext
- USPTO: https://tmsearch.uspto.gov
- EUIPO: https://euipo.europa.eu/eSearch

If nothing in classes 9, 35, 41 or 42 is identical or near-identical, a UK word mark (classes 9 and 42; £170 online) is worth filing before launch PR. Use a plain description, "online world map on which users claim and publish plots", with no "Meta" logo styling. See `docs/golive/01-domain-report.md` §1 for why "Meta" carries some opposition risk.

**5. Switching domain later (who: owner + server admin).** It is a `.env` change, `APP_URL` and `PRODUCTION_DOMAIN`, plus the external dashboards:
- Stripe webhook URL;
- PayPal return URLs;
- the Google OAuth redirect URI;
- the mail domain;
- Cloudflare DNS.

Then re-render nginx: `node scripts/new-instance.mjs production --nginx-only`. Details in `docs/golive/01-domain-report.md` §4.
