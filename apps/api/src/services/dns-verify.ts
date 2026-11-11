import { resolveTxt } from 'node:dns/promises';
import { randomToken } from '../lib/crypto.js';

/**
 * G12: prove control of a company's domain with a DNS TXT record, for people without a work email at that domain.
 * The record goes on `_flatmeta.<domain>` (or the domain itself): `flatmeta-verify=<token>`.
 */
export type TxtResolver = (host: string) => Promise<string[][]>;
let resolver: TxtResolver = resolveTxt;

/** Tests replace the resolver. */
export function setTxtResolver(r: TxtResolver | null) {
  resolver = r ?? resolveTxt;
}

export const newDnsToken = () => randomToken(18).replace(/[^A-Za-z0-9]/g, '').slice(0, 24).padEnd(24, '0');
export const dnsRecordFor = (domain: string, token: string) => ({ host: `_flatmeta.${domain}`, alsoAccepted: domain, type: 'TXT' as const, value: `flatmeta-verify=${token}` });

export async function domainHasToken(domain: string, token: string): Promise<boolean> {
  const want = `flatmeta-verify=${token}`;
  for (const host of [`_flatmeta.${domain}`, domain]) {
    try {
      const records = await resolver(host);
      if (records.some((chunks) => chunks.join('').trim() === want)) return true;
    } catch {
      /* no such record: try the next host */
    }
  }
  return false;
}
