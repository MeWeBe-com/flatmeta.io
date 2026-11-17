# The first 10 customers: ready-to-send outreach (Round 3)

**One action for the owner:** export the list, then send ten emails today from hello@flatmeta.io. Everything is written; you only fill the brackets from the export.

**Before you start** (both are in MANUAL-STEPS → Round 3, items 1 and 3):
- production runs the go-live build;
- email from flatmeta.io works.

Until then, links in these emails would show the old site.

## 1. Get the list (2 minutes)

Admin → **Company land** → set **Outreach: Not contacted** → **Download CSV** (`/api/v1/admin/company-land?outreach=not_contacted&format=csv`). Use only the rows that have a contact page.

Each row has:
- the company name;
- its FlatMeta plot URL;
- its country;
- the public contact page found by the daily job (a role address or a form, never a person's private email);
- the outreach status. After sending, set it to **Contacted** in the same screen, so nobody is emailed twice.

Pick ten, preferring companies in the countries with the most explorers (see the weekly report). The Sales agent (`ops/agents/sales.md`) can pick and fill these for you every weekday. A person still presses send.

## 2. Email A: a company with a reserved landmark (send 7)

> **Subject:** [Company] has a reserved page on the FlatMeta world map
>
> Hello [Company] team,
>
> FlatMeta is a world map where people, businesses and brands have their own pages. We reserved a landmark for [Company] next to your headquarters, clearly marked "not affiliated" until someone from your team claims it:
>
> [plot URL]
>
> Claiming is free during our launch. Verify with a work email on [company domain] or one DNS record, then add your logo, story, links and careers. Every page is structured data that search engines and AI assistants read.
>
> As one of our first [founding places] founding companies, you'd also get [launch offer, if set] and your story featured, only if you want it.
>
> Not interested? Reply "remove" and we'll take the page down within 48 hours.
>
> The FlatMeta team · https://www.flatmeta.io

## 3. Email B: a local business (send 3)

> **Subject:** A free page for [Business] on the FlatMeta map
>
> Hello [Business],
>
> More people now ask AI assistants where to eat, shop or book. FlatMeta gives your business a verified page at your real address: hours with a live "Open now" marker, an offer, booking links and a guestbook, written as structured data that assistants read.
>
> Here's what a page looks like: https://www.flatmeta.io/demo
>
> Your first land is free, and it takes about three minutes: https://www.flatmeta.io/?claim
>
> We're looking for [founding places] founding businesses. Founders get a direct line to us and their story featured, only if they want it.
>
> The FlatMeta team · https://www.flatmeta.io

## 4. LinkedIn or contact-form version (under 300 characters)

> Hi [Company] team: FlatMeta reserved a landmark for [Company] on our world map, next to your HQ, marked "not affiliated" until you claim it. Claiming is free during launch: [plot URL]. Not interested? Reply and we'll remove it within 48 h.

## 5. Follow-up, 5 days later, once only

> **Subject:** Re: [original subject]
>
> Just checking this reached the right person. The page is here: [plot URL]. It's free to claim, or we remove it on request. Either way, a one-word reply helps us.
>
> The FlatMeta team

## Rules

- Send from hello@flatmeta.io, signed "The FlatMeta team". Never from a personal account, and never pretend to be someone else.
- One email, plus at most one follow-up. A "remove" reply is handled within 48 hours (Admin → Claims & takedowns).
- No claims about traffic or results. Quote only the numbers in the weekly report.
- Log every send in `docs/golive/drafts/<date>-sales.md`: the company, the date and the reply. The CEO agent counts them.
