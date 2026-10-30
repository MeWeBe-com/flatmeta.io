import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { storeImage, type StoredImage } from '../../lib/storage.js';
import { proceduralPng } from './procedural.js';

export const SAFE_SUFFIX = 'Original illustration, no logos, no text, no lettering, no trademarks, no real people.';

export interface ImageRequest {
  /** Stable id used for seeds and for the external pipeline. */
  id: string;
  prompt: string;
  palette?: string[];
  motif?: string;
  ownerUserId?: string | null;
  folder?: string;
  provider?: typeof config.AI_IMAGE_PROVIDER;
}

export interface ImageResult extends StoredImage {
  provider: string;
  /** True when the real image is pending in the external pipeline (a placeholder was stored). */
  pending?: boolean;
}

async function openaiImage(prompt: string): Promise<Buffer> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const res = await client.images.generate({ model: config.OPENAI_IMAGE_MODEL, prompt, size: '1536x1024', n: 1 });
  const b64 = res.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, 'base64');
  const url = res.data?.[0]?.url;
  if (!url) throw new Error('OpenAI returned no image');
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

async function geminiImage(prompt: string): Promise<Buffer> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const res = await ai.models.generateImages({ model: config.GEMINI_IMAGE_MODEL, prompt, config: { numberOfImages: 1, aspectRatio: '16:9' } });
  const bytes = res.generatedImages?.[0]?.image?.imageBytes;
  if (!bytes) throw new Error('Gemini returned no image');
  return Buffer.from(bytes, 'base64');
}

/** Queues a prompt for the external pipeline (e.g. Google Flow): outbox/prompts.jsonl → inbox/{id}.png */
export async function queueExternal(id: string, prompt: string) {
  const outbox = path.resolve(config.EXTERNAL_IMAGE_DIR, 'outbox');
  await mkdir(outbox, { recursive: true });
  await mkdir(path.resolve(config.EXTERNAL_IMAGE_DIR, 'inbox'), { recursive: true });
  await appendFile(path.join(outbox, 'prompts.jsonl'), JSON.stringify({ id, prompt, aspect: '3:2', createdAt: new Date().toISOString() }) + '\n');
}

/**
 * Generates and stores an image with the configured provider. Paid providers
 * fall back to procedural art on error so a plot is never left without a cover.
 */
export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const provider = req.provider ?? config.AI_IMAGE_PROVIDER;
  const prompt = `${req.prompt.trim()} ${SAFE_SUFFIX}`;
  const store = (buf: Buffer, source: 'ai' | 'procedural' | 'external') =>
    storeImage(buf, { ownerUserId: req.ownerUserId, source, prompt, folder: req.folder });
  const procedural = () => store(proceduralPng({ seed: req.id, palette: req.palette, motif: req.motif }), 'procedural');

  try {
    if (provider === 'openai' && config.OPENAI_API_KEY) return { ...(await store(await openaiImage(prompt), 'ai')), provider };
    if (provider === 'gemini' && config.GEMINI_API_KEY) return { ...(await store(await geminiImage(prompt), 'ai')), provider };
    if (provider === 'external') {
      await queueExternal(req.id, prompt);
      return { ...(await procedural()), provider, pending: true };
    }
  } catch (err) {
    logger.warn({ err, provider }, 'Image provider failed; using procedural art');
  }
  return { ...(await procedural()), provider: 'procedural' };
}
