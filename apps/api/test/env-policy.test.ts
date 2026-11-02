import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * Loads src/config.ts in a fresh process with a given environment (config is read once at import),
 * and reports the decisions that matter for staging vs production.
 */
function probe(env: Record<string, string>) {
  const code = `
    const c = await import('./src/config.ts');
    const img = c.config.AI_IMAGE_PROVIDER;
    console.log(JSON.stringify({ mock: c.paymentsMock(), echo: c.devCodeEcho(), text: c.textProvider(), moderation: c.moderationProvider(), image: img }));
  `;
  const base = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', SESSION_SECRET: 'x'.repeat(40), APP_URL: 'https://staging.flatmeta.io' };
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: { ...base, ...env }, cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true as const, ...JSON.parse(out.trim().split('\n').pop()!) };
  } catch (e) {
    return { ok: false as const, error: String((e as { stderr?: string }).stderr ?? e) };
  }
}

describe('staging vs production policy (real config loading)', () => {
  it('staging (NODE_ENV=production, APP_ENV=staging) without keys: mock checkout, on-screen codes, heuristic AI, procedural art', () => {
    const r = probe({ NODE_ENV: 'production', APP_ENV: 'staging' });
    expect(r).toMatchObject({ ok: true, mock: true, echo: true, text: 'heuristic', moderation: 'heuristic', image: 'procedural' });
  });

  it('staging with SMTP configured stops showing codes on screen', () => {
    expect(probe({ NODE_ENV: 'production', APP_ENV: 'staging', SMTP_HOST: 'smtp.example.com' })).toMatchObject({ ok: true, echo: false });
  });

  it('production refuses the fake checkout and never shows codes, even without SMTP', () => {
    expect(probe({ NODE_ENV: 'production', APP_ENV: 'production', APP_URL: 'https://flatmeta.io', PAYMENTS_MOCK: 'true' })).toMatchObject({ ok: true, mock: false, echo: false });
  });

  it('production refuses DEV_CODE_ECHO=true at startup', () => {
    const r = probe({ NODE_ENV: 'production', APP_ENV: 'production', APP_URL: 'https://flatmeta.io', DEV_CODE_ECHO: 'true' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/DEV_CODE_ECHO=true is not allowed/);
  });

  it('a production build that does not set APP_ENV gets production rules', () => {
    expect(probe({ NODE_ENV: 'production', PAYMENTS_MOCK: 'true' })).toMatchObject({ ok: true, mock: false, echo: false });
  });

  it('a Stripe key always wins over the mock, and an Anthropic key switches AI on', () => {
    expect(probe({ NODE_ENV: 'production', APP_ENV: 'staging', STRIPE_SECRET_KEY: 'sk_test_x' })).toMatchObject({ ok: true, mock: false });
    expect(probe({ NODE_ENV: 'production', APP_ENV: 'staging', ANTHROPIC_API_KEY: 'k' })).toMatchObject({ ok: true, text: 'anthropic', moderation: 'anthropic' });
  });
});
