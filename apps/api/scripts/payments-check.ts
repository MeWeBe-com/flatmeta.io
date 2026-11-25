/**
 * GL4: which payment accounts this server's .env points at, without printing any key.
 *   npm run payments:check -w flatmeta-api
 * Prints the Stripe account name, id, country, live/test mode and whether it can take charges, the key/webhook
 * problems, and whether PayPal is set up (sandbox or live). Run it on the server after pasting keys.
 */
import { config, stripeAccountName, stripeMode, stripeProblems } from '../src/config.js';
import { stripeAccountInfo } from '../src/services/billing.js';
import { paypalEnabled } from '../src/services/paypal.js';

const account = await stripeAccountInfo().catch((e: Error) => {
  console.log(`Stripe: could not read the account (${e.message.slice(0, 120)})`);
  return null;
});
console.log(`APP_NAME: ${config.APP_NAME} · APP_ENV: ${config.APP_ENV}`);
console.log(`Stripe key mode: ${stripeMode()}`);
if (account) {
  console.log(`Stripe account: "${account.name ?? '(no name)'}" ${account.id} · ${account.country ?? '?'} · ${account.livemode ? 'LIVE' : 'test'} · charges ${account.chargesEnabled ? 'enabled' : 'NOT enabled'}`);
  const want = stripeAccountName();
  console.log(account.nameMatches ? `  ✓ named exactly "${want}"` : `  ✗ not named "${want}": use the "${want}" account inside the boss's Organisation, or set STRIPE_ACCOUNT_NAME to the account's exact name`);
}
for (const p of stripeProblems()) console.log(`  ✗ ${p}`);
console.log(`Webhook URL to register in Stripe: ${config.API_URL}/v1/stripe/webhook`);
console.log(`PayPal: ${paypalEnabled() ? `set up (${config.PAYPAL_ENV})` : 'not set up (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)'}`);
process.exit(0);
