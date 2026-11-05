import type { Metadata } from 'next';
import { COMPANY_COUNTRY, COMPANY_NAME, CONTACT_EMAIL, FREE_LAND_CELLS, PAID_CHECKOUT, PLAUSIBLE_DOMAIN } from '@/lib/config';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';

// Company details come from the repo-root .env (COMPANY_NAME, COMPANY_COUNTRY, CONTACT_EMAIL) with safe defaults.
// A lawyer should still review all three documents.
const COMPANY = COMPANY_NAME;
const COUNTRY = COMPANY_COUNTRY;
const CONTACT = CONTACT_EMAIL;
const UPDATED = '5 November 2026';
const LAND_TERMS = PAID_CHECKOUT
  ? 'Each verified account may claim one free Homestead plot (up to 4 cells outside city centres, or 1 cell in a prime area). Other land is a one-time purchase priced per cell by zone, shown before you pay.'
  : `At launch, payments are not open yet: each verified account (and each organisation) may claim up to ${FREE_LAND_CELLS} squares of land for free. When paid land opens, land you already hold stays yours, and new land is a one-time purchase priced per cell by zone, shown before you pay.`;

type Section = [heading: string, paragraphs: string[]];
const DOCS: Record<string, { title: string; intro: string; sections: Section[] }> = {
  terms: {
    title: 'Terms of Service',
    intro: `These terms apply when you use FlatMeta (flatmeta.io, its apps, API and MCP server), run by ${COMPANY} ("we"). By using FlatMeta you agree to them.`,
    sections: [
      ['1. What FlatMeta is', ['FlatMeta is a shared world map where you can claim plots made of grid cells, decorate them with images, text and links, and take part in a game (XP, quests, badges, leaderboards).', 'A plot is a licence to display your content on a part of our map. It is not ownership of any real place, not real estate, and not a financial product, token or investment. Plots have no cash value and cannot be redeemed for money.']],
      ['2. Accounts', ['You can explore as a guest. To claim land, play or buy, you verify an email address. You must be at least 16 (or the age of digital consent where you live). You are responsible for activity on your account. Organisation accounts are managed by their owners and admins.']],
      ['3. Land, plans and prices', [LAND_TERMS, 'Subscriptions (Plus, Business, Brand) renew monthly or yearly until cancelled and can be managed in the customer portal. Boosts such as Spotlight and Beacon last for the period stated at purchase.', 'Payments are processed by Stripe. Prices may change; we give at least 30 days’ notice before a change affects an existing subscription. Land you have already bought is not affected by price changes.', 'We keep plots available for as long as FlatMeta operates. If we ever close the service we will give at least 90 days’ notice.']],
      ['4. Showcase plots', ['Some plots are showcase samples that illustrate how well-known organisations could use FlatMeta. They use the organisation’s name only, with original imagery, and are labelled as unclaimed and not affiliated. Only verified representatives can claim them. Organisations can request removal at any time from the plot page.']],
      ['5. Your content', ['You keep the rights to what you add. You give us a worldwide, non-exclusive, royalty-free licence to host, display, adapt (e.g. resize) and share it on FlatMeta and in previews of FlatMeta pages for as long as it is there.', 'Do not post anything illegal, infringing, sexual involving minors, harassing, hateful, violent, deceptive, malicious or spam, and do not impersonate others. Content made with our AI tools is yours to use on FlatMeta; you are responsible for checking it before publishing.']],
      ['6. Fair play', ['Do not use bots, multiple accounts or exploits to gain XP, ranks or land. XP and ranks cannot be bought or sold. We may reset progress gained unfairly.']],
      ['7. Moderation', ['Content is checked by automated systems and people. We may hide or remove content, reset a plot to its default look, revoke land or suspend accounts that break these terms. Where we remove paid land for reasons other than your breach, we refund the price you paid for it.']],
      ['8. API and MCP', ['Use of the API and MCP server is subject to rate limits and these terms. Do not use them to scrape personal data, spam, or overload the service.']],
      ['9. Liability', ['FlatMeta is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing limits liability that cannot be limited by law or your statutory consumer rights.']],
      ['10. Ending and law', [`You can delete your account at any time by contacting ${CONTACT}. These terms are governed by the laws of ${COUNTRY}, without removing protections you have where you live.`]],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: `This explains what ${COMPANY} ("we") collects when you use FlatMeta, why, and your choices. Contact: ${CONTACT}.`,
    sections: [
      ['What we collect', ['Account: email, username, display name, avatar, bio, home country, organisation memberships.', 'Activity: plots and their content, likes, waves, follows, guestbook notes, quests, XP and achievements, reports.', 'Payments: handled by Stripe. We receive customer, subscription and payment IDs and amounts, never full card details.', 'Technical: IP address, device and browser information and logs, used for security, abuse prevention and rate limiting. We store your session in a secure cookie.', 'Location: to start the map near you we use the approximate, city-level location our network provider (Cloudflare) derives from your connection. It is used for that page load only and not stored. We ask for your precise location only if you press “Locate me” or accept “Start where you are?”; it stays on your device. If you are signed in, we save your last position on the map so you start there next time.']],
      ['Why we use it', ['To run FlatMeta and your account (contract), take payments (contract), keep the service safe and moderate content (legitimate interests), improve FlatMeta with aggregated statistics (legitimate interests), and meet legal obligations such as tax records.']],
      ['AI features', ['When you use the AI Designer, AI search or suggestions, the text you provide (and, for moderation, content you publish) is sent to the AI provider we use (such as Anthropic, OpenAI or Google) to generate a response. These providers process it on our behalf; we choose settings that keep your content out of model training wherever the provider offers that option. Images may be generated by these providers or by our own servers.']],
      ['Cookies and analytics', [`We use one essential cookie to keep you signed in, and store small preferences (theme, tour done) on your device. ${PLAUSIBLE_DOMAIN ? 'We count visits with Plausible Analytics, which uses no cookies and collects no personal data: no IP addresses are stored and visitors are not tracked across sites.' : 'We do not use analytics cookies.'} We do not use advertising or tracking cookies.`]],
      ['Who sees what', ['Your username, avatar, level, badges and published plots are public. Email addresses are never shown publicly. We use processors for hosting, email delivery, payments (Stripe), AI (as above), map tiles (OpenFreeMap / OpenStreetMap) and place search. We do not sell your data and do not use advertising cookies.']],
      ['Retention', ['While your account exists; payment records as long as tax law requires (typically 6–7 years); logs up to 90 days; deleted content is removed from backups within 35 days.']],
      ['Your rights', [`You can access, correct, export or delete your data, object to some uses, and complain to your data protection authority. Email ${CONTACT}; we reply within 30 days.`]],
      ['Children', ['FlatMeta is not for children under 16.']],
    ],
  },
  refunds: {
    title: 'Payments & Refunds',
    intro: 'How payments, cancellations and refunds work on FlatMeta.',
    sections: [
      ['Land', ['Land is a one-time purchase shown with its price before checkout. If your payment completes but the land was taken in the meantime, you are refunded automatically in full.', 'You can ask for a refund within 14 days of buying land if you have not published content on it. After that, land purchases are final, except where the law gives you more rights.']],
      ['Subscriptions', ['Plus, Business and Brand renew automatically. Cancel any time in Dashboard → Billing (customer portal); you keep the plan until the end of the paid period. We do not refund partial periods unless required by law.']],
      ['Boosts and AI packs', ['Spotlight, Beacon and AI Design Packs start immediately, so they are not refundable once used, unless they failed to work.']],
      ['Landmark claims', ['Landmark claims for showcase plots can be refunded within 14 days if the organisation decides not to keep the plot.']],
      ['How to ask', [`Email ${CONTACT} with your order number (Dashboard → Billing). Refunds go back to the original payment method, usually within 5–10 days.`]],
    ],
  },
};

type Params = { params: Promise<{ doc: string }> };

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { doc } = await params;
  return { title: DOCS[doc]?.title ?? 'Legal', alternates: { canonical: `/legal/${doc}` } };
}

export default async function LegalPage({ params }: Params) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <PageShell>
      <article id="main" className="max-w-3xl space-y-6">
        <h1 className="text-4xl font-bold">{d.title}</h1>
        <p className="text-sm muted">Last updated {UPDATED}</p>
        <p>{d.intro}</p>
        {d.sections.map(([h, ps]) => (
          <section key={h} className="space-y-2">
            <h2 className="text-xl font-semibold">{h}</h2>
            {ps.map((p) => (
              <p key={p.slice(0, 40)} className="muted leading-relaxed">{p}</p>
            ))}
          </section>
        ))}
      </article>
    </PageShell>
  );
}
