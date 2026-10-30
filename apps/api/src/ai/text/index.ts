/**
 * Provider-agnostic structured text generation. Each call gets a Zod schema and
 * returns validated data, or null when no provider is configured (callers then
 * use their heuristic fallback). Providers: Anthropic (default), OpenAI, Gemini.
 */
import { z } from 'zod';
import { config, textProvider } from '../../config.js';
import { logger } from '../../lib/logger.js';

export interface GenerateOptions<T extends z.ZodType> {
  schema: T;
  system: string;
  prompt: string;
  /** Use the cheaper/faster model where configured (moderation, intent parsing). */
  fast?: boolean;
  maxTokens?: number;
}

let anthropicClient: import('@anthropic-ai/sdk').default | null = null;

async function viaAnthropic<T extends z.ZodType>(o: GenerateOptions<T>): Promise<z.infer<T> | null> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
  anthropicClient ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const msg = await anthropicClient.beta.messages.parse({
    model: o.fast ? config.ANTHROPIC_MODEL_FAST : config.ANTHROPIC_MODEL,
    max_tokens: o.maxTokens ?? 8000,
    system: o.system,
    messages: [{ role: 'user', content: o.prompt }],
    output_config: { effort: o.fast ? 'low' : 'medium', format: betaZodOutputFormat(o.schema) },
    // Server-side fallback on policy refusals (routes by refusal category).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (msg.stop_reason === 'refusal') {
    logger.warn({ details: msg.stop_details }, 'Claude declined the request');
    return null;
  }
  return (msg.parsed_output as z.infer<T> | null) ?? null;
}

async function viaOpenAI<T extends z.ZodType>(o: GenerateOptions<T>): Promise<z.infer<T> | null> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: config.OPENAI_MODEL,
    messages: [
      { role: 'system', content: `${o.system}\nRespond with JSON only, matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(o.schema))}` },
      { role: 'user', content: o.prompt },
    ],
    response_format: { type: 'json_object' },
  });
  const text = res.choices[0]?.message?.content ?? '';
  return o.schema.parse(JSON.parse(text));
}

async function viaGemini<T extends z.ZodType>(o: GenerateOptions<T>): Promise<z.infer<T> | null> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: o.prompt,
    config: { systemInstruction: o.system, responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(o.schema) },
  });
  return o.schema.parse(JSON.parse(res.text ?? ''));
}

export const aiAvailable = () => textProvider() !== 'heuristic';

export async function generateJson<T extends z.ZodType>(o: GenerateOptions<T>): Promise<z.infer<T> | null> {
  const provider = textProvider();
  try {
    if (provider === 'anthropic' && config.ANTHROPIC_API_KEY) return await viaAnthropic(o);
    if (provider === 'openai' && config.OPENAI_API_KEY) return await viaOpenAI(o);
    if (provider === 'gemini' && config.GEMINI_API_KEY) return await viaGemini(o);
  } catch (err) {
    logger.warn({ err: (err as Error).message, provider }, 'AI text generation failed; falling back to heuristics');
  }
  return null;
}
