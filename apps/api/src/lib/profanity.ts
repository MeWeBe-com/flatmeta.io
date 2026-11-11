/**
 * Light profanity filter for public chat (G9): common swear words are masked ("f***") rather than refused, so a
 * friendly conversation isn't blocked by one word. Hate speech and abuse stay with the moderation blocklist, which
 * refuses the whole message (services/chat.ts). Matching ignores case, repeated letters and common look-alikes.
 */
const WORDS = ['fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dick', 'dickhead', 'cunt', 'wanker', 'twat', 'prick', 'bollocks', 'piss', 'pissed', 'crap', 'douche', 'slut', 'whore'];

const LEET: Record<string, string> = { a: '[a@4]', e: '[e3]', i: '[i1!|]', o: '[o0]', s: '[s$5]', t: '[t7]', u: '[uv*]' };

const pattern = (w: string) => w.split('').map((ch) => `${LEET[ch] ?? ch}+`).join('[\\W_]*');
const RE = new RegExp(`(?<![\\p{L}\\p{N}])(${WORDS.map(pattern).join('|')})(?![\\p{L}\\p{N}])`, 'giu');

export function maskProfanity(text: string): string {
  return text.replace(RE, (m) => m[0] + '*'.repeat(Math.max(2, m.length - 1)));
}

export function hasProfanity(text: string): boolean {
  RE.lastIndex = 0;
  const hit = RE.test(text);
  RE.lastIndex = 0;
  return hit;
}
