import { expect, test } from '@playwright/test';

/**
 * G8: owner custom HTML runs in an opaque-origin sandbox. The probe hides its intent from the server-side scan
 * (string building), as a real attacker would, so this checks the browser-enforced isolation itself: no cookies,
 * no storage, no access to the page around it, no top navigation.
 */
const PROBE = `<div id="out">running</div><script>
var r = [], d = self['docu' + 'ment'];
try { r.push('cookie:' + JSON.stringify(d['coo' + 'kie'])); } catch (e) { r.push('cookie:' + e.name); }
try { r.push('parent:' + self['par' + 'ent']['docu' + 'ment'].title); } catch (e) { r.push('parent:' + e.name); }
try { r.push('storage:' + self['local' + 'Storage'].length); } catch (e) { r.push('storage:' + e.name); }
try { self['to' + 'p']['loca' + 'tion']['hr' + 'ef'] = 'https://example.com/'; r.push('nav:tried'); } catch (e) { r.push('nav:' + e.name); }
d.getElementById('out').textContent = r.join('|');
</script>`;

test('sandboxed custom HTML cannot read cookies, storage or the parent page, or navigate it', async ({ page, context }) => {
  const email = `sandbox-${Date.now().toString(36)}@test.dev`;
  const { devCode } = (await (await context.request.post('/api/v1/auth/request-code', { data: { email } })).json()) as { devCode?: string };
  test.skip(!devCode, 'needs on-screen sign-in codes');
  expect((await context.request.post('/api/v1/auth/verify-code', { data: { email, code: devCode } })).ok()).toBeTruthy();
  expect((await context.cookies()).some((c) => c.name === 'fm_session')).toBe(true);

  const preview = await context.request.post('/api/v1/sandbox/preview', { data: { html: PROBE } });
  expect(preview.ok()).toBeTruthy();
  const { ok, url } = (await preview.json()) as { ok: boolean; url: string };
  expect(ok).toBe(true); // the obfuscated probe gets past the scan: the sandbox has to hold on its own
  const u = new URL(url);
  const src = process.env.E2E_USERCONTENT ? url : `${u.pathname}${u.search}`;

  await page.goto('/legal/terms');
  await page.evaluate(() => localStorage.setItem('fm-sandbox-probe', 'secret'));
  const before = page.url();
  await page.evaluate((s) => {
    const f = document.createElement('iframe');
    f.src = s;
    f.setAttribute('sandbox', 'allow-scripts');
    f.title = 'probe';
    document.body.appendChild(f);
  }, src);
  const out = page.frameLocator('iframe[title="probe"]').locator('#out');
  await expect(out).not.toHaveText('running', { timeout: 15_000 });
  const text = (await out.textContent()) ?? '';
  expect(text).toContain('cookie:SecurityError');
  expect(text).toContain('parent:SecurityError');
  expect(text).toContain('storage:SecurityError');
  expect(text).not.toContain('secret');
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(before); // the top page was not navigated

  // Opened directly, the document still gets an opaque origin (CSP sandbox), so it can't read our cookies either.
  // (A cookie-only probe: opened as the top page, a document may navigate itself.)
  const cookieOnly = PROBE.replace(/try \{ self\['to'[^\n]*\n/, '');
  const second = (await (await context.request.post('/api/v1/sandbox/preview', { data: { html: cookieOnly } })).json()) as { url: string };
  const s2 = new URL(second.url);
  const direct = await page.context().newPage();
  await direct.goto(process.env.E2E_USERCONTENT ? second.url : `${s2.pathname}${s2.search}`);
  await expect(direct.locator('#out')).toContainText('cookie:SecurityError');
  await expect(direct.locator('#out')).toContainText('storage:SecurityError');
  await direct.close();
});
