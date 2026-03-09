import type { FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { registerAuthRoutes } from './modules/auth/index.js';
import { registerTemplatesRoutes, registerEndpointsRoutes } from './modules/templates/index.js';
import { registerProjectsRoutes } from './modules/projects/index.js';
import { registerCompositesRoutes } from './modules/composites/index.js';
import { registerPreviewsRoutes } from './modules/previews/index.js';
import { registerComponentSpecRoutes } from './modules/component-spec/index.js';
import { registerShopsRoutes, registerShoplazzaIntegrationRoutes } from './modules/integrations/shoplazza/index.js';
import { registerGmailRoutes } from './modules/integrations/gmail/index.js';
import { registerChatRoutes } from './modules/chat/index.js';
import { registerContactsRoutes } from './modules/audience/contacts/index.js';
import { registerSegmentsRoutes } from './modules/audience/segments/index.js';
import { registerBroadcastsRoutes, registerBroadcastAnalyticsRoutes } from './modules/broadcasts/index.js';
import { registerAutomationsRoutes } from './modules/automations/index.js';
import { registerAnalyticsRoutes } from './modules/analytics/index.js';
import { registerSettingsRoutes } from './modules/settings/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'email-editor-dev-secret-change-in-production';
const BODY_LIMIT = Number(process.env.BODY_LIMIT_BYTES) || 15 * 1024 * 1024;

const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/health',
  '/api/component-spec',
  '/api/gmail/callback',
  '/api/gmail/connect',
  '/api/integrations/shoplazza/webhooks',
  '/api/contacts/unsubscribe',
]);

const TRACKING_PATH_PREFIXES = ['/tracking/pixel/', '/tracking/click/'];

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: BODY_LIMIT });

  // ── Core plugins ──────────────────────────────────────────────────────────
  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: JWT_SECRET });
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-cookie-secret-change-in-production',
    hook: 'onRequest',
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  // ── JWT auth preHandler ───────────────────────────────────────────────────
  app.addHook('preHandler', async function (request, reply) {
    const url = request.url.split('?')[0];

    if (PUBLIC_PATHS.has(url) || url.startsWith('/api/auth/')) return;
    if (TRACKING_PATH_PREFIXES.some((p) => url.startsWith(p))) return;

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ error: '请重新登录' });
    }
    try {
      const payload = await request.jwtVerify<{ userId: string; email: string }>();
      const uid = payload.userId != null ? String(payload.userId).trim() : '';
      (request as FastifyRequest & { userId: string }).userId = uid;
    } catch {
      return reply.status(401).send({ error: '请重新登录' });
    }
  });

  // ── Modules ───────────────────────────────────────────────────────────────
  await registerAuthRoutes(app);
  await registerTemplatesRoutes(app);
  await registerEndpointsRoutes(app);
  await registerProjectsRoutes(app);
  await registerCompositesRoutes(app);
  await registerPreviewsRoutes(app);
  await registerComponentSpecRoutes(app);
  await registerShopsRoutes(app);
  await registerGmailRoutes(app);
  await registerChatRoutes(app);
  await registerShoplazzaIntegrationRoutes(app);
  await registerContactsRoutes(app);
  await registerSegmentsRoutes(app);
  await registerBroadcastsRoutes(app);
  await registerBroadcastAnalyticsRoutes(app);
  await registerAutomationsRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerSettingsRoutes(app);

  app.get('/api/health', async (_, reply) => {
    return reply.send({ ok: true });
  });

  return app;
}
