# Pricing review (G13, November 2026)

Checked against the growth analysis (`docs/growth-analysis-2026-11.md`). Amounts live in `apps/api/src/lib/pricing.ts`.

| Offer | Price | Who | Verdict |
| --- | --- | --- | --- |
| Free | 100 free squares (+ referral bonus squares), 3 plots, 3 AI designs/month | everyone | **Keep.** The free claim is the top of the funnel; the referral bonus (G11) now extends it. |
| Plus | $5/month or $48/year | creators, link-in-bio users | **Keep, sell it where it's needed.** Custom HTML (G8), premium frames, 30 AI designs, 10 plots. Biggest leak was that nothing offered it at the moment of need: fixed (below). Annual shown first (save 20%). |
| Business | $29/month or $290/year | shops, cafés, local businesses | **Keep.** Business details, opening hours, booking links, team. |
| Brand | $249/month or $2,490/year | companies | **Keep.** The reserved company land (G12) is the pipeline for it. |
| Landmark claim | $990 one-time, includes 3 months of Brand | companies claiming their reserved plot | **Keep.** Clear, one decision; converts into Brand after 3 months. |
| Spotlight / Beacon | $9 (7 days) / $3 (24 h) | owners who want visitors | Keep. |
| AI Design Pack | $5 for 25 designs | free users out of credits | Keep; now offered when credits run out. |

## The top upsell, implemented: upgrade at the paywall

Every paid feature answers HTTP 402 with the plan that unlocks it (`details.upsell`: plus, business or credits). The web
app turns any 402 into an upgrade dialog (`apps/web/src/components/overlays.tsx` → `UpgradeDialog`): what Plus
includes, yearly or monthly, and **one click to Stripe Checkout**. Checkout returns to the same page with
`?upgraded=plus`, the session refreshes and the feature works at once. Paywall views and paywall checkouts are
counted per day (no personal data) so the funnel shows on **Admin → Metrics**.

While `PAID_CHECKOUT_ENABLED` is off, the dialog says paid plans are coming soon. To sell:
follow `docs/stripe-live.md` (live keys are set; run `stripe:sync`, then set `PAID_CHECKOUT_ENABLED=true` and deploy).

## Measure

**Admin → Metrics** (`/admin/metrics`): signups, land claims, paid conversions (first payment per person or
organisation) and revenue per day, over 7, 30 or 90 days, plus MRR from active subscriptions and paywall → paid.
