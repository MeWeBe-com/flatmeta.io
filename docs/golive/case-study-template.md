# Customer story: template and permission (R3d)

Use this for every customer story, quote or logo. **Nothing goes on the site, in a post or in the mewebe.com listing without the customer's written "yes".** Once you have it, add the story to `apps/web/src/data/customer-stories.ts` with the `permission` filled in. It then appears on `/business` and `/pricing`; without the permission it never shows.

---

## 1. Permission email (copy, fill the brackets, send from hello@flatmeta.io)

> **Subject:** Can we share how [Company] uses FlatMeta?
>
> Hi [First name],
>
> Thank you for being one of FlatMeta's founding customers. We'd love to feature [Company] on our website and social channels. Here is exactly what we would publish:
>
> - **Quote:** "[the quote, word for word]"
> - **Name and role:** [First name Last name], [Role] at [Company]
> - **Result (only if you're happy to share it):** [e.g. "38 table bookings from the map in the first month"]
> - **Logo:** [yes / no]
> - **Link:** your FlatMeta page, [https://www.flatmeta.io/p/slug]
>
> Please reply "Yes" to approve all of it, or tell us what to change or leave out. You can ask us to take it down at any time and we will do so within 48 hours.
>
> Thank you,
> The FlatMeta team

**Keep the reply.** Save it in the shared drive or the CRM. Copy who said yes and the date into `permission.grantedBy` (e.g. "Ana Silva, email to hello@") and `permission.date` (YYYY-MM-DD). List only what they approved in `permission.covers`: `quote`, `name`, `logo`, `result`.

## 2. Interview (15 minutes, by call or email)

1. What did you use before FlatMeta to be found online, and what was missing?
2. Why did you claim your page (or plot)?
3. What happened after you published it? (visits, likes, bookings, messages, anything you noticed)
4. Which part did you use most: hours and Open now, the offer, the guestbook, the AI Designer, the map?
5. What would you tell another business owner about it, in one sentence? (This becomes the quote.)
6. What should we build next?

For numbers, use the customer's own words or their FlatMeta dashboard (visits, likes, guestbook notes). Never estimate a result for them.

## 3. The story (publish on /insights and socials, about 300 words)

**Title:** How [Company] [result in plain words] with FlatMeta

- **The business:** one paragraph: who they are, where, what they sell.
- **The problem:** what was missing before. Use their words from question 1.
- **What they did:** claimed a page, the parts they used, how long it took.
- **What happened:** only confirmed results, with the period (e.g. "in the first 30 days").
- **Quote:** the approved quote.
- **Try it:** "Claim your free plot at https://www.flatmeta.io/?claim", or "Is your company already on the map? https://www.flatmeta.io/brands".

## 4. Entry for `customer-stories.ts`

```ts
{
  slug: 'corner-cafe-lisbon',
  company: 'Corner Café',
  plotSlug: 'corner-cafe',
  person: 'Ana Silva',
  role: 'Owner',
  quote: 'People found us on the map and came in asking for the offer.',
  result: '38 bookings from the map in the first month',
  logoUrl: '/media/…/logo.webp',
  permission: { grantedBy: 'Ana Silva, email to hello@ on 2026-12-02', date: '2026-12-02', covers: ['quote', 'name', 'result'] },
},
```

Then open a pull request to `v2`. The Sales agent can draft the email and the story; a person sends the email and adds the entry.
