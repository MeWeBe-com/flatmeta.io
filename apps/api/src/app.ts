import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { hasZodFastifySchemaValidationErrors, jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import authPlugin from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';
import { registerMcp } from './mcp/http.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    // The web app calls the API on the same origin; CORS is for third-party API-key clients (no cookies).
    origin: true,
    credentials: false,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, {
    global: true,
    hook: 'preHandler', // after auth, so signed-in users are limited per account
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    redis: config.NODE_ENV === 'test' ? undefined : redis,
    nameSpace: `${config.REDIS_PREFIX}:rl:`,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: { code: 'rate_limited', message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.` },
    }),
  });
  await app.register(websocket);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'FlatMeta API',
        version: '2.0.0',
        description:
          'The FlatMeta REST API: explore the world map, search and manage plots, organisations, game progress and billing.\n\nAuthenticate with a session cookie (web app) or `Authorization: Bearer fm_live_…` (API keys from Dashboard → Developers). An MCP server is available at `/mcp`.',
      },
      servers: [{ url: config.API_URL }],
      components: {
        securitySchemes: {
          apiKey: { type: 'http', scheme: 'bearer', description: 'API key: fm_live_…' },
          session: { type: 'apiKey', in: 'cookie', name: 'fm_session' },
        },
      },
      security: [{ apiKey: [] }, { session: [] }],
      tags: [
        { name: 'auth' }, { name: 'me' }, { name: 'world' }, { name: 'plots' }, { name: 'regions' }, { name: 'social' },
        { name: 'search' }, { name: 'ai' }, { name: 'orgs' }, { name: 'billing' }, { name: 'showcase' }, { name: 'admin' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list', deepLinking: true } });

  await app.register(authPlugin);

  if (config.STORAGE_DRIVER === 'local') {
    const dir = path.resolve(config.MEDIA_DIR);
    mkdirSync(dir, { recursive: true });
    // In production nginx serves /media directly; this is for development.
    await app.register(fastifyStatic, { root: dir, prefix: '/media/', decorateReply: false, maxAge: '365d', immutable: true });
  }

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({ error: { code: 'validation_error', message: 'Some fields are not valid', details: err.validation } });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: err.code ?? 'error', message: err.message } });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: { code: 'not_found', message: `No route for ${req.method} ${req.url}` } }));

  app.get('/healthz', { schema: { hide: true } }, async () => {
    await redis.ping();
    return { ok: true, env: config.APP_ENV, time: new Date().toISOString() };
  });
  app.get('/', { schema: { hide: true } }, async () => ({ name: 'FlatMeta API', version: '2.0.0', docs: '/docs', openapi: '/openapi.json', mcp: '/mcp' }));
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  await registerRoutes(app);
  await registerMcp(app);
  return app;
}

/** A minimal app that serves only /mcp (and /healthz); used when MCP_PORT is set. */
export async function buildMcpApp() {
  const app = Fastify({ loggerInstance: logger, trustProxy: config.TRUST_PROXY, bodyLimit: 2 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(authPlugin);
  app.get('/healthz', async () => ({ ok: true, mcp: true }));
  await registerMcp(app as unknown as App);
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
