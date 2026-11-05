import { config } from '../config.js';

/** Every outgoing email has a type: it becomes a Resend tag and decides the queue priority. */
export type EmailType =
  | 'sign_in_code'
  | 'claim_code'
  | 'org_invite'
  | 'clan_invite'
  | 'listing_sold'
  | 'listing_purchased'
  | 'listing_refund'
  | 'payout_sent'
  | 'payout_failed'
  | 'claim_approved'
  | 'claim_rejected'
  | 'landmark_ready'
  | 'takedown_result'
  | 'admin_claim_review'
  | 'admin_claim_lead'
  | 'admin_takedown'
  | 'notice';

export interface EmailContent {
  type: EmailType;
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: config.CURRENCY.toUpperCase() }).format(cents / 100);
const url = (path: string) => `${config.APP_URL}${path}`;

interface Block {
  title: string;
  paragraphs: string[]; // plain text; escaped for HTML
  code?: string;
  button?: { label: string; path: string };
  footnote?: string;
}

/** One layout for every email: dark card, optional big code, optional button. Text and HTML come from the same blocks. */
function render(type: EmailType, subject: string, b: Block): EmailContent {
  const link = b.button ? url(b.button.path) : null;
  const text = [b.title, '', ...b.paragraphs.flatMap((p) => [p, '']), ...(b.code ? [b.code, ''] : []), ...(link ? [`${b.button!.label}: ${link}`, ''] : []), ...(b.footnote ? [b.footnote, ''] : []), `${config.APP_NAME} · ${config.APP_URL}`]
    .join('\n')
    .trim();
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#0B1020;font-family:Inter,Segoe UI,Arial,sans-serif;color:#E8ECF8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#141B33;border-radius:20px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#2DE2C4">◆ ${esc(config.APP_NAME)}</td></tr>
<tr><td style="padding-top:16px;font-size:18px;font-weight:600;color:#FFFFFF">${esc(b.title)}</td></tr>
${b.paragraphs.map((p) => `<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#C9D1EA">${esc(p).replace(/\n/g, '<br>')}</td></tr>`).join('\n')}
${b.code ? `<tr><td style="padding:18px 0 4px;font-size:34px;letter-spacing:8px;font-weight:700;color:#FFC94D">${esc(b.code)}</td></tr>` : ''}
${link ? `<tr><td style="padding-top:22px"><a href="${esc(link)}" style="display:inline-block;background:#2DE2C4;color:#0B1020;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">${esc(b.button!.label)}</a></td></tr>` : ''}
${b.footnote ? `<tr><td style="padding-top:20px;font-size:12px;line-height:1.5;color:#7C86A8">${esc(b.footnote)}</td></tr>` : ''}
</table><p style="font-size:12px;color:#7C86A8">${esc(config.APP_NAME)} · the world map you can own a piece of</p></td></tr></table></body></html>`;
  return { type, subject, text, html };
}

const IGNORE = "If you didn't ask for this, you can ignore this email.";

export const templates = {
  signInCode: (code: string) =>
    render('sign_in_code', `${code} is your ${config.APP_NAME} code`, { title: `Your ${config.APP_NAME} sign-in code`, paragraphs: ['Use this code to sign in:'], code, footnote: `It expires in 15 minutes. ${IGNORE}` }),

  claimCode: (code: string, orgName: string) =>
    render('claim_code', `${code} verifies you at ${orgName}`, { title: `Verify your organisation on ${config.APP_NAME}`, paragraphs: [`Use this code to confirm that you work at ${orgName}:`], code, footnote: `It expires in 15 minutes. ${IGNORE}` }),

  orgInvite: (inviter: string, orgName: string, token: string) =>
    render('org_invite', `Join ${orgName} on ${config.APP_NAME}`, {
      title: `${inviter} invited you to ${orgName}`,
      paragraphs: [`You've been invited to help manage ${orgName} on ${config.APP_NAME}.`],
      button: { label: 'Accept the invite', path: `/dashboard/orgs?invite=${encodeURIComponent(token)}` },
      footnote: `The link works for 14 days. ${IGNORE}`,
    }),

  clanInvite: (inviter: string, clan: { name: string; tag: string; slug: string }) =>
    render('clan_invite', `${inviter} invited you to [${clan.tag}] ${clan.name}`, {
      title: `Join the clan [${clan.tag}] ${clan.name}`,
      paragraphs: [`${inviter} would like you in their clan. Clans pool XP, share a private chat and climb the clan leaderboard together.`],
      button: { label: 'See the invite', path: `/clan/${clan.slug}` },
    }),

  listingSold: (plot: { title: string; slug: string }, priceCents: number, feeCents: number) =>
    render('listing_sold', `You sold ${plot.title} for ${money(priceCents)}`, {
      title: `Sold: ${plot.title}`,
      paragraphs: [`Your plot sold for ${money(priceCents)}. After the ${money(feeCents)} platform fee, ${money(priceCents - feeCents)} was added to your balance.`, 'Payouts go out automatically once your payout account is set up in Billing.'],
      button: { label: 'Open Billing', path: '/dashboard/billing' },
    }),

  listingPurchased: (plot: { title: string; slug: string }, priceCents: number) =>
    render('listing_purchased', `${plot.title} is yours`, {
      title: `You bought ${plot.title}`,
      paragraphs: [`Payment of ${money(priceCents)} received. The plot and everything on it is now yours to design.`],
      button: { label: 'Open your plot', path: `/p/${plot.slug}` },
    }),

  listingRefund: (reason: string, amountCents: number) =>
    render('listing_refund', `Refund: ${money(amountCents)}`, {
      title: 'Your purchase was refunded',
      paragraphs: [reason, `We refunded the full ${money(amountCents)} to your payment method. It usually appears within 5 to 10 days.`],
    }),

  payoutSent: (amountCents: number) =>
    render('payout_sent', `Payout of ${money(amountCents)} is on its way`, {
      title: 'Payout sent',
      paragraphs: [`We sent ${money(amountCents)} from your marketplace balance to your payout account.`],
      button: { label: 'See your balance', path: '/dashboard/billing' },
    }),

  payoutFailed: (amountCents: number) =>
    render('payout_failed', 'Action needed: your payout could not be sent', {
      title: 'Payout failed',
      paragraphs: [`We couldn't send ${money(amountCents)} to your payout account. Please check your payout details in Billing; we will retry automatically.`],
      button: { label: 'Open Billing', path: '/dashboard/billing' },
    }),

  claimApproved: (orgName: string, plotSlug: string, requestId: string) =>
    render('claim_approved', `Your ${config.APP_NAME} claim for ${orgName} is approved`, {
      title: 'Claim approved',
      paragraphs: [`We verified that you represent ${orgName}. You can now complete the Landmark claim and take over the showcase plot.`],
      button: { label: 'Complete the claim', path: `/claim/${plotSlug}?request=${requestId}` },
    }),

  claimRejected: (orgName: string, note: string | null) =>
    render('claim_rejected', `About your ${config.APP_NAME} claim for ${orgName}`, {
      title: 'We could not verify your claim',
      paragraphs: [`We couldn't confirm that you represent ${orgName}.`, ...(note ? [`Note from our team: ${note}`] : []), 'Reply to this email if you can share more details.'],
    }),

  landmarkReady: (plot: { title: string; slug: string }) =>
    render('landmark_ready', `${plot.title} is now your Landmark`, {
      title: 'Your Landmark is live',
      paragraphs: [`${plot.title} now belongs to your organisation, with three months of the Brand plan included. Make it yours with the AI Designer.`],
      button: { label: 'Edit your Landmark', path: `/p/${plot.slug}` },
    }),

  takedownResult: (removed: boolean) =>
    render('takedown_result', `Your ${config.APP_NAME} removal request`, {
      title: removed ? 'The plot was removed' : 'We kept the plot online',
      paragraphs: [removed ? 'We have removed the showcase plot you reported. Thank you for letting us know.' : 'We reviewed your request and kept the plot online. Reply to this email if you would like to discuss it.'],
    }),

  adminClaimReview: (orgName: string, email: string, plotTitle: string) =>
    render('admin_claim_review', `[Admin] Claim to review: ${orgName}`, {
      title: 'A showcase claim needs manual review',
      paragraphs: [`${email} says they represent ${orgName} and wants to claim "${plotTitle}". Their email domain doesn't match the organisation's website.`],
      button: { label: 'Review claims', path: '/admin/claims' },
    }),

  adminClaimLead: (orgName: string, email: string, plotTitle: string) =>
    render('admin_claim_lead', `[Admin] Verified Landmark lead: ${orgName}`, {
      title: 'A brand verified its showcase claim',
      paragraphs: [`${email} verified their work email for ${orgName} and wants "${plotTitle}". Paid checkout is off, so the claim is waiting as a lead: contact them, or enable payments and they can complete it from the claim page.`],
      button: { label: 'Open claims', path: '/admin/claims' },
    }),

  adminTakedown: (name: string, email: string, plotTitle: string, message: string) =>
    render('admin_takedown', `[Admin] Removal request: ${plotTitle}`, {
      title: 'A showcase removal was requested',
      paragraphs: [`${name} <${email}> asks us to remove "${plotTitle}".`, `Message: ${message}`],
      button: { label: 'Review requests', path: '/admin/claims' },
    }),

  notice: (subject: string, body: string) => render('notice', subject, { title: subject, paragraphs: body.split(/\n{2,}/) }),
};
