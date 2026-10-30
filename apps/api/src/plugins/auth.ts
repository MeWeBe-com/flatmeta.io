import type {} from '@fastify/cookie';
import fp from 'fastify-plugin';
import type { User } from '../db/schema.js';
import { SESSION_COOKIE, userFromApiKey, userFromSession } from '../lib/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    authKind: 'session' | 'apikey' | null;
    apiScopes: string[];
    apiOrgId: string | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('authKind', null);
  app.decorateRequest('apiScopes', null as unknown as string[]);
  app.decorateRequest('apiOrgId', null);

  app.addHook('onRequest', async (req) => {
    req.apiScopes = [];
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const found = await userFromApiKey(header.slice(7).trim());
      if (found) {
        req.user = found.user;
        req.authKind = 'apikey';
        req.apiScopes = found.scopes;
        req.apiOrgId = found.orgId;
      }
      return;
    }
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const user = await userFromSession(token);
      if (user) {
        req.user = user;
        req.authKind = 'session';
      }
    }
  });
});
