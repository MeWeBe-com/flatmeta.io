import { z } from 'zod';
import type { Plot } from '../db/schema.js';
import { countryName, nearestCity } from '../lib/geo.js';
import { generateJson } from './text/index.js';
import { MOTIFS, PALETTES } from './image/procedural.js';
import { generateImage } from './image/index.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const DesignVariation = z.object({
  title: z.string().min(2).max(80),
  tagline: z.string().max(140),
  descriptionMd: z.string().max(2000),
  category: z.string().max(40),
  tags: z.array(z.string().max(24)).max(6),
  cta: z.object({ label: z.string().max(40) }).nullable(),
  theme: z.object({ primary: hex, accent: hex }),
  palette: z.array(hex).length(3),
  motif: z.enum(MOTIFS),
  imagePrompt: z.string().max(600),
});
export type DesignVariation = z.infer<typeof DesignVariation>;

const DesignSet = z.object({ variations: z.array(DesignVariation).min(1).max(3) });

export interface DesignBrief {
  brief: string;
  name?: string;
  style?: string;
  website?: string;
}

const KEYWORDS: [RegExp, (typeof MOTIFS)[number], string][] = [
  [/coffee|caf[eé]|tea|espresso|bakery|brunch/i, 'cup', 'food & drink'],
  [/restaurant|food|kitchen|pizza|burger|sushi|chef|dining/i, 'plate', 'food & drink'],
  [/music|band|dj|concert|studio|song|record/i, 'music', 'music'],
  [/tech|software|app|ai|code|startup|developer|data/i, 'circuit', 'technology'],
  [/shop|store|fashion|boutique|clothing|retail|market/i, 'bag', 'shopping'],
  [/gym|fitness|sport|football|soccer|yoga|run|club/i, 'ball', 'sport'],
  [/garden|nature|eco|green|plant|farm|park/i, 'leaf', 'nature'],
  [/travel|hotel|tour|holiday|hostel|airline/i, 'globe', 'travel'],
  [/book|school|university|learn|library|education|tutor/i, 'book', 'education'],
  [/art|gallery|design|paint|photo|creative/i, 'star', 'arts'],
  [/film|cinema|video|movie|stream/i, 'film', 'entertainment'],
  [/energy|solar|power|electric/i, 'bolt', 'energy'],
  [/car|auto|bike|cycle|garage/i, 'wheel', 'auto'],
  [/museum|history|heritage|temple|church|monument/i, 'column', 'culture'],
  [/ocean|beach|surf|sea|swim|sail/i, 'waves', 'outdoors'],
  [/mountain|hike|climb|ski|trail/i, 'mountain', 'outdoors'],
  [/love|family|home|wedding|kids|pet/i, 'heart', 'personal'],
  [/health|clinic|doctor|care|wellness|spa/i, 'drop', 'health'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic, key-free designs: good copy templates + motif/palette picks. */
export function heuristicDesigns(plot: Plot, input: DesignBrief): DesignVariation[] {
  const city = nearestCity(plot.centerLat, plot.centerLng, 40)?.city.name;
  const place = city ?? (plot.countryCode ? countryName(plot.countryCode) : 'the open sea');
  const name = (input.name || plot.title || 'My place').trim().slice(0, 60);
  const match = KEYWORDS.find(([re]) => re.test(`${input.brief} ${input.name ?? ''}`));
  const motif = match?.[1] ?? MOTIFS[hash(name) % MOTIFS.length]!;
  const category = match?.[2] ?? 'personal';
  const briefLine = input.brief.trim().replace(/\s+/g, ' ').slice(0, 200);
  const tags = [...new Set([category.split(' ')[0]!, place.toLowerCase().split(' ')[0]!, ...briefLine.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4).slice(0, 3)])].slice(0, 5);
  const variants: { title: string; tagline: string; body: string; cta: string }[] = [
    {
      title: name,
      tagline: `${briefLine.split(/[.!?]/)[0]?.slice(0, 100) || 'A little corner of the world'} — in the heart of ${place}.`,
      body: `Welcome to **${name}**.\n\n${briefLine || 'This is my corner of the world map.'}\n\nDrop by, leave a note in the guestbook and wave if you're a neighbour.`,
      cta: 'Say hello',
    },
    {
      title: `${name} · ${place}`,
      tagline: `Your next favourite spot in ${place}.`,
      body: `### Why stop here\n- ${briefLine || 'Good people, good vibes'}\n- Rooted in ${place}\n- New things every week\n\nFollow along and come back often.`,
      cta: 'Find out more',
    },
    {
      title: `The ${name} Outpost`,
      tagline: `Where ${place} meets something new.`,
      body: `Every place has a story. Ours is simple: **${briefLine || 'make this corner of the map a little brighter'}**.\n\nExplore the neighbourhood, sign the guestbook and share it with a friend.`,
      cta: 'Visit',
    },
  ];
  return variants.map((v, i) => {
    const pal = PALETTES[(hash(name) + i * 3) % PALETTES.length]!;
    return {
      title: v.title.slice(0, 80),
      tagline: v.tagline.slice(0, 140),
      descriptionMd: v.body,
      category,
      tags,
      cta: input.website ? { label: v.cta } : null,
      theme: { primary: pal[1], accent: pal[2] },
      palette: [...pal],
      motif,
      imagePrompt: `A cosy isometric diorama of a small ${category} spot in ${place}, ${input.style || 'vivid game-like style'}, soft evening light, floating island, inviting and playful`,
    };
  });
}

export async function designVariations(plot: Plot, input: DesignBrief): Promise<{ variations: DesignVariation[]; provider: string }> {
  const city = nearestCity(plot.centerLat, plot.centerLng, 40)?.city.name;
  const place = [city, plot.countryCode ? countryName(plot.countryCode) : null].filter(Boolean).join(', ') || 'open water';
  const out = await generateJson({
    schema: DesignSet,
    system:
      'You are the AI Plot Designer for FlatMeta, a playful, beautiful world map where people and businesses own plots of land and publish a small page about them. Write warm, specific, original copy in British English. Never invent facts about real organisations, never use real slogans, no prices, no claims of partnership. Descriptions are Markdown (short paragraphs, optional bullet list), 60–140 words. Colours must look great on a dark navy map (#0B1020): vivid primary, warm accent. imagePrompt describes an ORIGINAL illustration for the plot cover (cosy isometric or painterly scene, 3:2), never logos, text or real people. Pick the motif that best fits.',
    prompt: `Create 3 distinct design variations for this plot.\nLocation: ${place}\nPlot size: ${plot.cellCount} cells\nCurrent title: ${plot.title}\nName (if given): ${input.name ?? '-'}\nWebsite: ${input.website ?? '-'}\nStyle wish: ${input.style ?? 'surprise me'}\nOwner's brief: """${input.brief.slice(0, 1500)}"""`,
  });
  if (out?.variations?.length) return { variations: out.variations.slice(0, 3), provider: 'ai' };
  return { variations: heuristicDesigns(plot, input), provider: 'heuristic' };
}

/** Full design run: copy + one cover image per variation. */
export async function runDesign(plot: Plot, input: DesignBrief, ownerUserId: string | null, jobId: string) {
  const { variations, provider } = await designVariations(plot, input);
  const withImages = [];
  for (const [i, v] of variations.entries()) {
    const img = await generateImage({ id: `${jobId}-${i}`, prompt: v.imagePrompt, palette: v.palette, motif: v.motif, ownerUserId, folder: 'designs' });
    withImages.push({ ...v, image: { mediaId: img.id, url: img.url, thumbUrl: img.thumbUrl, provider: img.provider, pending: !!img.pending } });
  }
  return { variations: withImages, provider };
}

export const IdeaSet = z.object({ ideas: z.array(z.object({ title: z.string().max(80), description: z.string().max(240) })).min(3).max(6) });

export async function plotIdeas(plot: Plot): Promise<{ title: string; description: string }[]> {
  const city = nearestCity(plot.centerLat, plot.centerLng, 40)?.city.name ?? (plot.countryCode ? countryName(plot.countryCode) : 'the sea');
  const out = await generateJson({
    schema: IdeaSet,
    fast: true,
    system: 'You suggest fun, concrete things a FlatMeta plot owner could do with their plot page (content ideas, mini events, offers, collaborations with neighbours, quests). Short, punchy, specific to the place and theme.',
    prompt: `Plot "${plot.title}" (${plot.category ?? 'uncategorised'}) in ${city}. Tagline: ${plot.tagline ?? '-'}. Give 5 ideas.`,
  });
  if (out) return out.ideas;
  return [
    { title: `Show off ${city}`, description: `Add a photo gallery of your favourite corners of ${city} and link a map of hidden gems.` },
    { title: 'Neighbour shout-outs', description: 'Wave at the plots around you and feature your favourite neighbour in your description.' },
    { title: 'Guestbook challenge', description: 'Ask visitors a question in your tagline and reply to the best answers each week.' },
    { title: 'Seasonal makeover', description: 'Run the AI Designer each season to give your plot a fresh look.' },
    { title: 'Spotlight weekend', description: 'Put your plot in the Spotlight before an event to appear first in your region.' },
  ];
}
