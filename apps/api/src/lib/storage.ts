import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { badRequest } from './errors.js';

export interface StoredImage {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

let s3: import('@aws-sdk/client-s3').S3Client | null = null;
async function s3Client() {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID ?? '', secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? '' },
      forcePathStyle: true,
    });
  }
  return s3;
}

/** Stores a file under the media root (or S3) and returns its public URL. */
export async function putFile(rel: string, body: Buffer, contentType: string): Promise<string> {
  return put(rel, body, contentType);
}

async function put(rel: string, body: Buffer, contentType: string): Promise<string> {
  if (config.STORAGE_DRIVER === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3Client()).send(
      new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: rel, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
    );
    return `${config.S3_PUBLIC_URL?.replace(/\/$/, '')}/${rel}`;
  }
  const full = path.resolve(config.MEDIA_DIR, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
  return `${config.MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${rel}`;
}

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif']);

/**
 * Validates an image by decoding it (not by file name), then stores a WebP
 * (≤ 1600 px wide) and a thumbnail (≤ 512 px) and records it in `media`.
 */
export async function storeImage(
  input: Buffer,
  opts: { ownerUserId?: string | null; source: 'upload' | 'ai' | 'procedural' | 'external'; prompt?: string; folder?: string },
): Promise<StoredImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { animated: true }).metadata();
  } catch {
    throw badRequest('That file is not an image we can read');
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw badRequest('Use a JPG, PNG, WebP or GIF image');
  if ((meta.width ?? 0) > 12000 || (meta.pageHeight ?? meta.height ?? 0) > 12000) throw badRequest('Image is too large');

  const animated = (meta.pages ?? 1) > 1;
  const full = await sharp(input, { animated }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(input).rotate().resize({ width: 512, height: 512, fit: 'cover', withoutEnlargement: false }).webp({ quality: 80 }).toBuffer();

  const id = randomUUID();
  const day = new Date().toISOString().slice(0, 7);
  const folder = opts.folder ?? 'plots';
  const base = `${folder}/${day}/${id}`;
  const url = await put(`${base}.webp`, full.data, 'image/webp');
  const thumbUrl = await put(`${base}-thumb.webp`, thumb, 'image/webp');
  const height = animated && meta.pageHeight ? Math.round((full.info.height / (meta.pages ?? 1))) : full.info.height;

  await db.insert(schema.media).values({
    id,
    ownerUserId: opts.ownerUserId ?? null,
    path: `${base}.webp`,
    url,
    thumbUrl,
    mime: 'image/webp',
    width: full.info.width,
    height,
    bytes: full.data.length,
    source: opts.source,
    prompt: opts.prompt,
  });
  return { id, url, thumbUrl, width: full.info.width, height };
}

/** Absolute URL for media (OG tags, MCP, emails). */
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${config.APP_URL.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}
