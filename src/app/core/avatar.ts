/**
 * Avatar builder: a small, self-contained SVG avatar in the style of
 * getavataaars.com (as the brief suggests). Avatars are always drawn inside a
 * circle. Only the compact `AvatarConfig` is sent over the network; each client
 * renders the SVG locally.
 */

export interface AvatarConfig {
  topType: string;
  accessoriesType: string;
  hairColor: string;
  facialHairType: string;
  clotheType: string;
  eyeType: string;
  eyebrowType: string;
  mouthType: string;
  skinColor: string;
  circleBg: string;
  /** Uploaded photo URL (http(s) on our API) used instead of the drawn avatar. */
  customImage?: string;
}

export const AVATAR_OPTIONS = {
  topType: [
    'NoHair', 'Eyepatch', 'Hat', 'Hijab', 'Turban', 'WinterHat1', 'WinterHat2', 'WinterHat3', 'WinterHat4',
    'LongHairBigHair', 'LongHairBob', 'LongHairBun', 'LongHairCurly', 'LongHairCurvy', 'LongHairDreads',
    'LongHairFrida', 'LongHairFro', 'LongHairFroBand', 'LongHairNotTooLong', 'LongHairShavedSides',
    'LongHairMiaWallace', 'LongHairStraight', 'LongHairStraight2', 'LongHairStraightStrand',
    'ShortHairDreads01', 'ShortHairDreads02', 'ShortHairFrizzle', 'ShortHairShaggyMullet',
    'ShortHairShortCurly', 'ShortHairShortFlat', 'ShortHairShortRound', 'ShortHairShortWaved',
    'ShortHairSides', 'ShortHairTheCaesar', 'ShortHairTheCaesarSidePart',
  ],
  accessoriesType: ['Blank', 'Kurt', 'Prescription01', 'Prescription02', 'Round', 'Sunglasses', 'Wayfarers'],
  hairColor: ['Auburn', 'Black', 'Blonde', 'BlondeGolden', 'Brown', 'BrownDark', 'PastelPink', 'Blue', 'Platinum', 'Red', 'SilverGray'],
  facialHairType: ['Blank', 'BeardMedium', 'BeardLight', 'BeardMajestic', 'MoustacheFancy', 'MoustacheMagnum'],
  clotheType: ['BlazerShirt', 'BlazerSweater', 'CollarSweater', 'GraphicShirt', 'Overall', 'ShirtCrewNeck', 'ShirtScoopNeck', 'ShirtVNeck'],
  eyeType: ['Close', 'Cry', 'Default', 'Dizzy', 'EyeRoll', 'Happy', 'Hearts', 'Side', 'Squint', 'Surprised', 'Wink', 'WinkWacky'],
  eyebrowType: [
    'Angry', 'AngryNatural', 'Default', 'DefaultNatural', 'RaisedExcited', 'RaisedExcitedNatural',
    'SadConcerned', 'SadConcernedNatural', 'UnibrowNatural', 'UpDown', 'UpDownNatural',
  ],
  mouthType: ['Concerned', 'Default', 'Disbelief', 'Eating', 'Grimace', 'Sad', 'ScreamOpen', 'Serious', 'Smile', 'Tongue', 'Twinkle', 'Vomit'],
  skinColor: ['Tanned', 'Yellow', 'Pale', 'Light', 'Brown', 'DarkBrown', 'Black'],
  circleBg: ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#db2777', '#d97706', '#4f46e5', '#0f172a'],
};

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function createRandomAvatarConfig(): AvatarConfig {
  return {
    topType: pick(AVATAR_OPTIONS.topType),
    accessoriesType: pick(AVATAR_OPTIONS.accessoriesType),
    hairColor: pick(AVATAR_OPTIONS.hairColor),
    facialHairType: pick(AVATAR_OPTIONS.facialHairType),
    clotheType: pick(AVATAR_OPTIONS.clotheType),
    eyeType: pick(['Default', 'Happy', 'Wink', 'Surprised', 'Hearts']),
    eyebrowType: pick(['Default', 'DefaultNatural', 'RaisedExcited', 'UpDown']),
    mouthType: pick(['Smile', 'Twinkle', 'Default', 'Tongue']),
    skinColor: pick(AVATAR_OPTIONS.skinColor),
    circleBg: pick(AVATAR_OPTIONS.circleBg.slice(0, 7)),
  };
}

/** Keeps only known keys/values so a config received from another user can't inject markup. */
export function sanitizeAvatarConfig(raw: any): AvatarConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const base = createRandomAvatarConfig();
  const out: any = {};
  (Object.keys(AVATAR_OPTIONS) as Array<keyof typeof AVATAR_OPTIONS>).forEach((key) => {
    const val = raw[key];
    if (key === 'circleBg') {
      out[key] = typeof val === 'string' && /^#[0-9a-f]{3,8}$/i.test(val) ? val : base.circleBg;
    } else {
      out[key] = (AVATAR_OPTIONS[key] as string[]).includes(val) ? val : (base as any)[key];
    }
  });
  if (typeof raw.customImage === 'string' && /^https?:\/\//i.test(raw.customImage)) {
    out.customImage = raw.customImage;
  }
  return out as AvatarConfig;
}

/**
 * "As you type a smiley, your character's face changes to it."
 */
export function detectSmileyExpression(text: string): string | undefined {
  if (!text) return undefined;
  if (/(:D|:-D|😂|🤣|😆)/.test(text)) return 'Twinkle';
  if (/(:\)|:-\)|😊|🙂|😄)/.test(text)) return 'Smile';
  if (/(:\(|:-\(|😢|😭|☹️)/.test(text)) return 'Sad';
  if (/(:O|:-O|:o|😮|😱)/.test(text)) return 'ScreamOpen';
  if (/(;\)|;-\)|😉)/.test(text)) return 'Wink';
  if (/(<3|❤️|😍|🥰)/.test(text)) return 'Hearts';
  if (/(:P|:-P|:p|😛|😜)/.test(text)) return 'Tongue';
  if (/(B\)|8\)|😎)/.test(text)) return 'Cool';
  return undefined;
}

const SKIN: Record<string, string> = {
  Tanned: '#FD9841', Yellow: '#F8D25C', Pale: '#FFDBB4', Light: '#EDB98A', Brown: '#D08B5B', DarkBrown: '#AE5D29', Black: '#614335',
};
const HAIR: Record<string, string> = {
  Auburn: '#A55728', Black: '#2C1B18', Blonde: '#B58143', BlondeGolden: '#D6B370', Brown: '#724133', BrownDark: '#4A312C',
  PastelPink: '#F59797', Blue: '#006494', Platinum: '#ECDCBF', Red: '#C93305', SilverGray: '#E8E1E1',
};
const CLOTH: Record<string, string> = {
  BlazerShirt: '#1e293b', BlazerSweater: '#334155', CollarSweater: '#0284c7', GraphicShirt: '#10b981',
  Overall: '#ea580c', ShirtCrewNeck: '#6366f1', ShirtScoopNeck: '#ec4899', ShirtVNeck: '#8b5cf6',
};

const svgCache = new Map<string, string>();

/** Renders an avatar config to an SVG data URI (cached). */
export function avatarDataUrl(config: AvatarConfig | null | undefined, expression?: string): string {
  const c = sanitizeAvatarConfig(config) || createRandomAvatarConfig();
  if (c.customImage) return c.customImage;

  const cacheKey = JSON.stringify(c) + '|' + (expression || '');
  const cached = svgCache.get(cacheKey);
  if (cached) return cached;

  const skin = SKIN[c.skinColor] || '#FFDBB4';
  const hair = HAIR[c.hairColor] || '#4A312C';
  const cloth = CLOTH[c.clotheType] || '#3b82f6';
  const bg = c.circleBg || '#2563eb';

  const mouth = expression || c.mouthType || 'Smile';
  const eye =
    expression === 'Wink' ? 'Wink'
    : expression === 'Hearts' ? 'Hearts'
    : expression === 'ScreamOpen' ? 'Surprised'
    : c.eyeType || 'Default';

  let eyes = `<circle cx="38" cy="46" r="3.4" fill="#1e293b"/><circle cx="62" cy="46" r="3.4" fill="#1e293b"/><circle cx="39.2" cy="44.8" r="1.1" fill="#fff"/><circle cx="63.2" cy="44.8" r="1.1" fill="#fff"/>`;
  if (eye === 'Happy' || eye === 'Close' || eye === 'Squint') {
    eyes = `<path d="M33 46 Q38 41 43 46" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M57 46 Q62 41 67 46" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
  } else if (eye === 'Wink' || eye === 'WinkWacky') {
    eyes = `<path d="M33 46 Q38 41 43 46" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/><circle cx="62" cy="46" r="3.6" fill="#1e293b"/><circle cx="63.2" cy="44.8" r="1.2" fill="#fff"/>`;
  } else if (eye === 'Hearts') {
    eyes = `<path d="M38 49 L34 45 A2.5 2.5 0 0 1 38 42 A2.5 2.5 0 0 1 42 45 Z" fill="#f43f5e"/><path d="M62 49 L58 45 A2.5 2.5 0 0 1 62 42 A2.5 2.5 0 0 1 66 45 Z" fill="#f43f5e"/>`;
  } else if (eye === 'Surprised' || eye === 'Dizzy') {
    eyes = `<circle cx="38" cy="46" r="4.6" fill="#fff" stroke="#1e293b" stroke-width="2"/><circle cx="38" cy="46" r="2.2" fill="#1e293b"/><circle cx="62" cy="46" r="4.6" fill="#fff" stroke="#1e293b" stroke-width="2"/><circle cx="62" cy="46" r="2.2" fill="#1e293b"/>`;
  }

  let brows = `<path d="M32 39 Q38 36 44 39" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M56 39 Q62 36 68 39" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  if (c.eyebrowType.includes('Angry')) {
    brows = `<path d="M32 37 L44 41" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/><path d="M68 37 L56 41" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/>`;
  } else if (c.eyebrowType.includes('Sad')) {
    brows = `<path d="M32 41 L44 37" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/><path d="M68 41 L56 37" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/>`;
  }

  let mouthSvg = `<path d="M41 59 Q50 67 59 59" stroke="#1e293b" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  if (mouth === 'Twinkle' || mouth === 'Eating') {
    mouthSvg = `<path d="M39 57 Q50 70 61 57 Z" fill="#ffffff" stroke="#1e293b" stroke-width="2.4"/>`;
  } else if (mouth === 'Sad' || mouth === 'Concerned' || mouth === 'Vomit') {
    mouthSvg = `<path d="M41 64 Q50 56 59 64" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
  } else if (mouth === 'ScreamOpen' || mouth === 'Disbelief') {
    mouthSvg = `<ellipse cx="50" cy="61" rx="6" ry="5" fill="#991b1b" stroke="#1e293b" stroke-width="2.2"/>`;
  } else if (mouth === 'Tongue') {
    mouthSvg = `<path d="M41 58 Q50 66 59 58" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M47 61 Q50 69 53 61 Z" fill="#fb7185"/>`;
  } else if (mouth === 'Serious' || mouth === 'Grimace' || mouth === 'Default') {
    mouthSvg = mouth === 'Default'
      ? `<path d="M43 60 Q50 64 57 60" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/>`
      : `<line x1="42" y1="60" x2="58" y2="60" stroke="#1e293b" stroke-width="2.8" stroke-linecap="round"/>`;
  }

  let top = `<path d="M24 42 C24 20 76 20 76 42 C72 29 60 26 50 26 C40 26 28 29 24 42 Z" fill="${hair}"/>`;
  if (c.topType === 'NoHair') {
    top = '';
  } else if (c.topType.includes('LongHair')) {
    top = `<path d="M21 45 C20 18 80 18 79 45 L82 74 L71 74 L71 42 C64 29 36 29 29 42 L29 74 L18 74 Z" fill="${hair}"/>`;
  } else if (c.topType.includes('Hat') || c.topType === 'Turban' || c.topType === 'Hijab') {
    top = `<path d="M22 39 C22 19 78 19 78 39 Z" fill="#0f172a"/><rect x="17" y="36" width="66" height="6" rx="3" fill="#334155"/>`;
  } else if (c.topType === 'Eyepatch') {
    top += `<rect x="31" y="41" width="15" height="10" rx="4" fill="#0f172a"/><line x1="24" y1="38" x2="76" y2="50" stroke="#0f172a" stroke-width="2"/>`;
  }

  let acc = '';
  const cool = expression === 'Cool';
  if (c.accessoriesType !== 'Blank' || cool) {
    const fill = c.accessoriesType === 'Sunglasses' || c.accessoriesType === 'Wayfarers' || cool ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.25)';
    acc = `<rect x="29" y="40" width="18" height="12" rx="4" fill="${fill}" stroke="#0f172a" stroke-width="2.4"/><rect x="53" y="40" width="18" height="12" rx="4" fill="${fill}" stroke="#0f172a" stroke-width="2.4"/><line x1="47" y1="45" x2="53" y2="45" stroke="#0f172a" stroke-width="2.4"/>`;
  }

  let beard = '';
  if (c.facialHairType !== 'Blank') {
    beard = c.facialHairType.includes('Moustache')
      ? `<path d="M38 56 Q50 51 62 56 Q50 54 38 56 Z" fill="${hair}"/>`
      : `<path d="M27 52 C27 72 73 72 73 52 L69 52 C67 65 33 65 31 52 Z" fill="${hair}" opacity="0.88"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><defs><clipPath id="c"><circle cx="50" cy="50" r="48"/></clipPath></defs><g clip-path="url(#c)"><circle cx="50" cy="50" r="48" fill="${bg}"/><path d="M18 100 C20 74 80 74 82 100 Z" fill="${cloth}"/><rect x="43" y="64" width="14" height="14" rx="5" fill="${skin}"/><circle cx="25" cy="49" r="5" fill="${skin}"/><circle cx="75" cy="49" r="5" fill="${skin}"/><ellipse cx="50" cy="48" rx="24" ry="25" fill="${skin}"/>${brows}${eyes}<path d="M48 50 Q50 54 52 50" stroke="rgba(0,0,0,0.28)" stroke-width="2" fill="none" stroke-linecap="round"/>${beard}${mouthSvg}${top}${acc}</g></svg>`;

  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  svgCache.set(cacheKey, url);
  return url;
}
