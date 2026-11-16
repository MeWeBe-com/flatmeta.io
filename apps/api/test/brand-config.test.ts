import { describe, expect, it } from 'vitest';
import { applyBrandDefaults, publicSiteUrl, senderDomainProblem } from '../src/config.js';

/** GL1: every address follows the brand and the production domain, so a domain switch is a .env change. */
describe('brand and domain from config', () => {
  const base = { APP_NAME: 'FlatMeta', PRODUCTION_DOMAIN: 'flatmeta.io', MAIL_FROM: '', CONTACT_EMAIL: '', SEED_ADMIN_EMAIL: '', GEOCODER_USER_AGENT: '' };
  it('derives the sender (noreply@), contact (hello@), admin and user agent from the domain', () => {
    expect(applyBrandDefaults({ ...base })).toMatchObject({
      MAIL_FROM: 'FlatMeta <noreply@flatmeta.io>',
      CONTACT_EMAIL: 'hello@flatmeta.io',
      SEED_ADMIN_EMAIL: 'admin@flatmeta.io',
      GEOCODER_USER_AGENT: 'FlatMeta/2.0 (hello@flatmeta.io)',
    });
  });
  it('a new domain and name change every address', () => {
    expect(applyBrandDefaults({ ...base, APP_NAME: 'PlotGlobe', PRODUCTION_DOMAIN: 'plotglobe.com' })).toMatchObject({
      MAIL_FROM: 'PlotGlobe <noreply@plotglobe.com>',
      CONTACT_EMAIL: 'hello@plotglobe.com',
    });
  });
  it('values set in .env win', () => {
    expect(applyBrandDefaults({ ...base, MAIL_FROM: 'FlatMeta <hello@mail.mewebe.net>' }).MAIL_FROM).toBe('FlatMeta <hello@mail.mewebe.net>');
  });
  it('the public site URL is www.<domain> in production when APP_URL is the bare domain', () => {
    expect(publicSiteUrl({ APP_URL: 'https://flatmeta.io', APP_ENV: 'production', PRODUCTION_DOMAIN: 'flatmeta.io' })).toBe('https://www.flatmeta.io');
    expect(publicSiteUrl({ APP_URL: 'https://staging.flatmeta.io', APP_ENV: 'staging', PRODUCTION_DOMAIN: 'flatmeta.io' })).toBe('https://staging.flatmeta.io');
  });
  it('GL5: replies go to support@<domain>; production warns while mail still comes from another domain', () => {
    expect(applyBrandDefaults({ ...base }).MAIL_REPLY_TO).toBe('support@flatmeta.io');
    expect(senderDomainProblem({ APP_ENV: 'production', PRODUCTION_DOMAIN: 'flatmeta.io', MAIL_FROM: 'FlatMeta <hello@mail.mewebe.net>' })).toMatch(/mewebe\.net, not flatmeta\.io/);
    expect(senderDomainProblem({ APP_ENV: 'production', PRODUCTION_DOMAIN: 'flatmeta.io', MAIL_FROM: 'FlatMeta <noreply@flatmeta.io>' })).toBeNull();
    expect(senderDomainProblem({ APP_ENV: 'production', PRODUCTION_DOMAIN: 'flatmeta.io', MAIL_FROM: 'noreply@mail.flatmeta.io' })).toBeNull();
    expect(senderDomainProblem({ APP_ENV: 'staging', PRODUCTION_DOMAIN: 'flatmeta.io', MAIL_FROM: 'x@mail.mewebe.net' })).toBeNull();
  });
});
