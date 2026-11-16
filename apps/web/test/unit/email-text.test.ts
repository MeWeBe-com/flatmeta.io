import { describe, expect, it } from 'vitest';
import { emailOffHtml } from '@/components/email-text';

describe('GL3z email addresses safe from Cloudflare Email Obfuscation', () => {
  it('wraps each address in email_off markers and escapes the rest', () => {
    expect(emailOffHtml('Email hello@flatmeta.io or support@flatmeta.io <now>')).toBe(
      'Email <!--email_off-->hello@flatmeta.io<!--/email_off--> or <!--email_off-->support@flatmeta.io<!--/email_off--> &lt;now&gt;',
    );
  });
  it('can link the address', () => {
    expect(emailOffHtml('hello@flatmeta.io', true)).toBe('<!--email_off--><a class="underline" data-inline-link href="mailto:hello@flatmeta.io">hello@flatmeta.io</a><!--/email_off-->');
  });
  it('leaves text without addresses alone (escaped)', () => {
    expect(emailOffHtml('Fish & chips')).toBe('Fish &amp; chips');
  });
});
