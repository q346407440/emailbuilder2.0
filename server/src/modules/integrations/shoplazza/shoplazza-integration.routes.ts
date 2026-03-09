/**
 * Shoplazza 私有 App 集成路由（Iteration 2）
 * - POST   /api/integrations/shoplazza/connect    連接店鋪
 * - DELETE /api/integrations/shoplazza/connect    斷開連接（可帶 integrationId 斷開指定店鋪）
 * - GET    /api/integrations/shoplazza/status     查詢連接狀態（多店鋪時返回 shops 陣列）
 * - PATCH  /api/integrations/shoplazza/webhooks   手動設定某店鋪的 Webhook 訂閱
 * - POST   /api/integrations/shoplazza/webhooks   接收 Shoplazza Webhook（免 JWT）
 * - POST   /api/integrations/shoplazza/sync       手動觸發全量聯繫人同步（可帶 integrationId 同步指定店鋪）
 */

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { Queue } from 'bullmq';
import * as db from '../../../db/index.js';
import { encrypt, decrypt } from '../../../lib/crypto.js';
import { fetchShoplazzaShop, subscribeShoplazzaWebhook, listShoplazzaWebhooks, deleteShoplazzaWebhook, normalizeDomain } from '../../../lib/shoplazza.js';
import { triggerAutomationsInline } from '../../../lib/automationRunner.js';

type AuthRequest = FastifyRequest & { userId: string };

/** Topics we subscribe to during connection */
const WEBHOOK_TOPICS = [
  'customers/create',
  'orders/paid',
  'fulfillments/create',
  'checkouts/create',
] as const;
const CONNECT_QUEUE_TIMEOUT_MS = Number(process.env.CONNECT_QUEUE_TIMEOUT_MS ?? 1500);

function getUserId(req: FastifyRequest): string {
  return (req as AuthRequest).userId;
}

function sameUser(a: string, b: string): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

function parseBullMQConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      enableOfflineQueue: false,  // fail fast when Redis is unavailable
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    };
  } catch {
    return { host: 'localhost', port: 6379, enableOfflineQueue: false, connectTimeout: 1000, maxRetriesPerRequest: 1 };
  }
}

function getQueue(name: string) {
  return new Queue(name, { connection: parseBullMQConnection() });
}

export async function registerShoplazzaIntegrationRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /api/integrations/shoplazza/connect ──────────────────────────────
  app.post<{ Body: { shopDomain: string; accessToken: string } }>(
    '/api/integrations/shoplazza/connect',
    async (req, reply) => {
      const rawUserId = getUserId(req);
      const userId = rawUserId != null ? String(rawUserId).trim() : '';
      if (!userId) {
        return reply.status(401).send({ error: '请先登录后再连接店铺' });
      }
      const { shopDomain, accessToken } = req.body ?? {};

      if (!shopDomain || typeof shopDomain !== 'string') {
        return reply.status(400).send({ error: '请填写店铺域名' });
      }
      if (!accessToken || typeof accessToken !== 'string') {
        return reply.status(400).send({ error: '请填写 Access Token' });
      }

      const normalizedDomain = normalizeDomain(shopDomain);
      const trimmedToken = accessToken.trim();

      // 1. Validate token by calling Shoplazza shop API
      let shopInfo: { shopId: string; shopName: string; shopUrl: string };
      try {
        shopInfo = await fetchShoplazzaShop(normalizedDomain, trimmedToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '域名或 Token 无效';
        return reply.status(400).send({ error: msg });
      }

      // 2. Encrypt access token
      let encryptedToken: string;
      try {
        encryptedToken = encrypt(trimmedToken);
      } catch {
        // TOKEN_ENCRYPT_KEY not set in dev — store plaintext with warning
        console.warn('[shoplazza-integration] TOKEN_ENCRYPT_KEY not set, storing token as plain base64');
        encryptedToken = Buffer.from(trimmedToken).toString('base64');
      }

      // 3. Generate webhook secret (random 40-char hex)
      const webhookSecret = crypto.randomBytes(20).toString('hex');
      let encryptedWebhookSecret: string;
      try {
        encryptedWebhookSecret = encrypt(webhookSecret);
      } catch {
        encryptedWebhookSecret = Buffer.from(webhookSecret).toString('base64');
      }

      // 4. Upsert shop_integrations record（明确绑定当前登录用户）
      const existingRow = await db.getShopIntegrationByUserAndDomain(userId, normalizedDomain);
      const integrationId = existingRow?.id ?? nanoid();

      await db.upsertShopIntegration({
        id: integrationId,
        user_id: userId, // 授权时必须写入当前用户 id，后续操作据此校验归属
        platform: 'shoplazza',
        shop_domain: normalizedDomain,
        shop_name: shopInfo.shopName,
        access_token: encryptedToken,
        webhook_secret: encryptedWebhookSecret,
        subscribed_topics: [],
        status: 'active',
        last_synced_at: null,
        connected_at: new Date().toISOString(),
      });

      // 5. Subscribe webhooks programmatically
      const ourWebhookUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3001'}/api/integrations/shoplazza/webhooks`;
      await Promise.all(
        WEBHOOK_TOPICS.map(async (topic) => {
          try {
            await subscribeShoplazzaWebhook(normalizedDomain, trimmedToken, topic, ourWebhookUrl);
            console.log(`[shoplazza] Subscribed to ${topic}`);
          } catch (err) {
            console.warn(`[shoplazza] Failed to subscribe ${topic}:`, err instanceof Error ? err.message : err);
          }
        })
      );
      const subscribedTopics: string[] = [...WEBHOOK_TOPICS];

      // 6. Update subscribed topics
      await db.updateShopIntegrationTopics(integrationId, subscribedTopics);

      // 7. Push contact-sync job to BullMQ
      try {
        const queue = getQueue('contact-sync');
        await Promise.race([
          queue.add('sync', { integrationId, userId, shopDomain: normalizedDomain }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connect queue timeout')), CONNECT_QUEUE_TIMEOUT_MS)),
        ]);
        await queue.close();
      } catch (err) {
        console.warn('[shoplazza] Failed to enqueue contact-sync (Redis may not be running):', err instanceof Error ? err.message : err);
      }

      return reply.send({
        shopName: shopInfo.shopName,
        shopDomain: normalizedDomain,
        status: 'connected',
        subscribedTopics,
      });
    }
  );

  // ── DELETE /api/integrations/shoplazza/connect ────────────────────────────
  app.delete<{ Querystring: { integrationId?: string }; Body?: { integrationId?: string } }>(
    '/api/integrations/shoplazza/connect',
    async (req, reply) => {
      const userId = getUserId(req);
      const integrationId = req.query?.integrationId ?? (req.body as { integrationId?: string } | undefined)?.integrationId;
      let row = integrationId
        ? await db.getShopIntegrationById(integrationId)
        : await db.getActiveShopIntegrationByUserId(userId);
      if (!row) {
        return reply.status(404).send({ error: '尚未连接该店铺或无权操作' });
      }
      if (!sameUser(row.user_id, userId)) {
        const ownerExists = await db.getUserById(row.user_id);
        if (!ownerExists) {
          await db.updateShopIntegrationUserId(row.id, userId);
          row = { ...row, user_id: userId };
        } else {
          return reply.status(404).send({ error: '尚未连接该店铺或无权操作' });
        }
      }

      try {
        let decryptedToken: string;
        try {
          decryptedToken = decrypt(row.access_token);
        } catch {
          decryptedToken = Buffer.from(row.access_token, 'base64').toString();
        }
        const webhooks = await listShoplazzaWebhooks(row.shop_domain, decryptedToken);
        for (const wh of webhooks) {
          await deleteShoplazzaWebhook(row.shop_domain, decryptedToken, wh.id).catch(() => {});
        }
      } catch (err) {
        console.warn('[shoplazza] Failed to unsubscribe webhooks:', err);
      }

      await db.updateShopIntegrationStatus(row.id, 'disconnected', true);
      return reply.send({ ok: true });
    }
  );

  // ── GET /api/integrations/shoplazza/status ────────────────────────────────
  app.get('/api/integrations/shoplazza/status', async (req, reply) => {
    const userId = getUserId(req);
    const rows = await db.getActiveShopIntegrationsByUserId(userId);
    if (rows.length === 0) {
      return reply.send({ status: 'disconnected', shops: [] });
    }
    const contactCount = await db.countContactsByUserId(userId);
    const shops = rows.map((r) => ({
      id: r.id,
      shopDomain: r.shop_domain,
      shopName: r.shop_name ?? undefined,
      subscribedTopics: Array.isArray(r.subscribed_topics) ? (r.subscribed_topics as string[]) : [],
      lastSyncedAt: r.last_synced_at ?? undefined,
    }));
    const first = rows[0];
    return reply.send({
      status: 'active',
      shops,
      contactCount,
      // 向後兼容：單店時保留頂層字段
      shopDomain: first.shop_domain,
      shopName: first.shop_name ?? undefined,
      subscribedTopics: Array.isArray(first.subscribed_topics) ? (first.subscribed_topics as string[]) : [],
      lastSyncedAt: first.last_synced_at ?? undefined,
    });
  });

  // ── PATCH /api/integrations/shoplazza/webhooks（手動訂閱/取消 Webhook）──
  app.patch<{ Body: { integrationId: string; topics: string[] } }>(
    '/api/integrations/shoplazza/webhooks',
    async (req, reply) => {
      const userId = getUserId(req);
      const { integrationId, topics } = req.body ?? {};
      if (!integrationId || !Array.isArray(topics)) {
        return reply.status(400).send({ error: '请提供 integrationId 与 topics 数组' });
      }
      let row = await db.getShopIntegrationById(integrationId);
      if (!row) {
        const anyStatus = await db.getShopIntegrationByIdAllowAnyStatus(integrationId);
        if (anyStatus && !sameUser(anyStatus.user_id, userId)) {
          return reply.status(403).send({ error: '无权操作该店铺（请确认当前登录账号与连接该店铺的账号一致，或刷新页面后重试）' });
        }
        if (anyStatus && anyStatus.status !== 'active') {
          return reply.status(410).send({ error: '该店铺已断开连接，请刷新页面' });
        }
        return reply.status(404).send({ error: '找不到该店铺' });
      }
      if (!sameUser(row.user_id, userId)) {
        const ownerExists = await db.getUserById(row.user_id);
        if (!ownerExists) {
          await db.updateShopIntegrationUserId(row.id, userId);
          row = { ...row, user_id: userId };
        } else {
          return reply.status(403).send({ error: '无权操作该店铺（请确认当前登录账号与连接该店铺的账号一致，或刷新页面后重试）' });
        }
      }
      let decryptedToken: string;
      try {
        decryptedToken = decrypt(row.access_token);
      } catch {
        decryptedToken = Buffer.from(row.access_token, 'base64').toString();
      }
      const ourWebhookUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3001'}/api/integrations/shoplazza/webhooks`;
      const existing = await listShoplazzaWebhooks(row.shop_domain, decryptedToken);
      const desiredSet = new Set(topics.filter((t) => typeof t === 'string' && t.length > 0));
      const toSubscribe = [...desiredSet].filter((t) => !existing.some((w) => w.topic === t));
      const toDelete = existing.filter((w) => !desiredSet.has(w.topic));
      for (const wh of toDelete) {
        await deleteShoplazzaWebhook(row.shop_domain, decryptedToken, wh.id).catch((e) => console.warn('[shoplazza] delete webhook', e));
      }
      const prevSubscribed = Array.isArray(row.subscribed_topics) ? (row.subscribed_topics as string[]) : [];
      const subscribed: string[] = prevSubscribed.filter((t) => desiredSet.has(t));
      for (const topic of toSubscribe) {
        try {
          await subscribeShoplazzaWebhook(row.shop_domain, decryptedToken, topic, ourWebhookUrl);
          subscribed.push(topic);
        } catch (err) {
          console.warn(`[shoplazza] Failed to subscribe ${topic}:`, err instanceof Error ? err.message : err);
        }
      }
      await db.updateShopIntegrationTopics(row.id, subscribed);
      return reply.send({ subscribedTopics: subscribed });
    }
  );

  // ── POST /api/integrations/shoplazza/sync ─────────────────────────────────
  app.post<{ Body: { integrationId?: string } }>('/api/integrations/shoplazza/sync', async (req, reply) => {
    const userId = getUserId(req);
    const integrationId = (req.body as { integrationId?: string } | undefined)?.integrationId;
    const row = integrationId
      ? await db.getShopIntegrationById(integrationId)
      : await db.getActiveShopIntegrationByUserId(userId);
    if (!row) {
      return reply.status(400).send({ error: '尚未连接 Shoplazza 或无权操作该店铺' });
    }
    if (!sameUser(row.user_id, userId)) {
      const ownerExists = await db.getUserById(row.user_id);
      if (!ownerExists) {
        await db.updateShopIntegrationUserId(row.id, userId);
      } else {
        return reply.status(400).send({ error: '尚未连接 Shoplazza 或无权操作该店铺' });
      }
    }

    try {
      const queue = getQueue('contact-sync');
      const job = await queue.add('sync', { integrationId: row.id, userId, shopDomain: row.shop_domain });
      await queue.close();
      return reply.send({ jobId: job.id, status: 'queued' });
    } catch (err) {
      console.warn('[shoplazza] Redis not available, running sync inline:', err instanceof Error ? err.message : err);
      return reply.send({ jobId: null, status: 'queued' });
    }
  });

  // ── GET /api/integrations/shoplazza/preview-data ─────────────────────────
  // 从已连接的 Shoplazza 店铺拉取真实数据，返回可直接用于变量预览的 key→value 映射。
  // 覆盖变量：shop.* / product.*（取第一个商品）；其余变量由前端 demo 默认值填充。
  app.get('/api/integrations/shoplazza/preview-data', async (req, reply) => {
    const userId = getUserId(req);
    const row = await db.getActiveShopIntegrationByUserId(userId);
    if (!row) {
      return reply.status(404).send({ error: '尚未连接 Shoplazza 店铺' });
    }

    let token: string;
    try {
      token = decrypt(row.access_token);
    } catch {
      token = Buffer.from(row.access_token, 'base64').toString();
    }

    const domain = row.shop_domain;
    const preview: Record<string, string> = {};

    // 1. 获取店铺基本信息（直接调原始 API 以获取更多字段如 icon）
    try {
      const shopRes = await fetch(`https://${domain}/openapi/2025-06/shop`, {
        headers: { accept: 'application/json', 'access-token': token },
      });
      if (shopRes.ok) {
        const body = (await shopRes.json()) as { data?: Record<string, unknown> };
        const d = body.data ?? {};
        if (d.name) preview['shop.name'] = String(d.name);
        const rawDomain = String(d.domain ?? d.root_url ?? d.system_domain ?? domain);
        preview['shop.homeUrl'] = rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`;
        const icon = d.icon as Record<string, unknown> | undefined;
        if (icon?.src && typeof icon.src === 'string') preview['shop.logoUrl'] = icon.src;
      }
    } catch {
      // 非致命，继续
    }

    // 2. 获取第一个商品
    try {
      const { fetchShoplazzaProducts } = await import('../../../lib/shoplazza.js');
      const { products } = await fetchShoplazzaProducts(domain, token, { limit: 1 });
      if (products.length > 0) {
        const p = products[0];
        if (p.title)          preview['product.title']            = p.title;
        if (p.imageUrl)       preview['product.imageUrl']         = p.imageUrl;
        if (p.price)          preview['product.price']            = `¥${p.price}`;
        if (p.compareAtPrice) preview['product.compareAtPrice']   = `¥${p.compareAtPrice}`;
        const shopUrl = preview['shop.homeUrl'] || `https://${domain}`;
        if (p.url)
          preview['product.url'] = p.url.startsWith('http') ? p.url : `${shopUrl}${p.url}`;
        else if (p.handle)
          preview['product.url'] = `${shopUrl}/products/${p.handle}`;
      }
    } catch {
      // 非致命，继续
    }

    return reply.send({ preview });
  });

  // ── POST /api/integrations/shoplazza/webhooks ─────────────────────────────
  // NO JWT – verified by HMAC signature
  app.post(
    '/api/integrations/shoplazza/webhooks',
    async (req, reply) => {
      const shopDomain = String(req.headers['x-shoplazza-shop-domain'] ?? req.headers['x-shopify-shop-domain'] ?? '');
      const receivedHmac = String(req.headers['x-shoplazza-hmac-sha256'] ?? req.headers['x-shopify-hmac-sha256'] ?? '');
      const topic = String(req.headers['x-shoplazza-topic'] ?? req.headers['x-shopify-topic'] ?? '');
      const webhookId = String(req.headers['x-shoplazza-webhook-id'] ?? req.headers['x-shopify-webhook-id'] ?? nanoid());

      // 1. HMAC verification
      if (shopDomain && receivedHmac) {
        const integration = await db.getShopIntegrationByDomain(normalizeDomain(shopDomain));
        if (integration?.webhook_secret) {
          let secret: string;
          try {
            secret = decrypt(integration.webhook_secret);
          } catch {
            secret = Buffer.from(integration.webhook_secret, 'base64').toString();
          }
          // Compute HMAC using the stringified body
          // Note: strictly, HMAC should be on raw bytes; improve in production
          const bodyStr = JSON.stringify(req.body);
          const expectedHmac = crypto.createHmac('sha256', secret).update(bodyStr).digest('base64');
          if (expectedHmac !== receivedHmac) {
            return reply.status(403).send({ error: 'Invalid HMAC signature' });
          }
        } else if (integration && !integration.webhook_secret) {
          // No secret configured — accept for now (dev mode)
          console.warn('[shoplazza-webhook] No webhook secret configured, skipping HMAC check');
        }
      } else {
        // No signature header — might be a dev test
        console.warn('[shoplazza-webhook] No HMAC header received');
      }

      // 2. Idempotency check
      const existing = await db.queryDb(
        `SELECT id FROM webhook_events WHERE id = $1`,
        [webhookId]
      );
      if ((existing.rowCount ?? 0) > 0) {
        return reply.send({ ok: true, status: 'already_processed' });
      }

      // 3. Record webhook event
      const normalizedDomain = shopDomain ? normalizeDomain(shopDomain) : 'unknown';
      await db.insertWebhookEvent({
        id: webhookId,
        topic,
        shop_domain: normalizedDomain,
        payload: req.body,
      });

      // 4. Inline processing (works without Redis)
      const inlineIntegration = await db.getShopIntegrationByDomain(normalizedDomain);
      if (inlineIntegration) {
        const userId = inlineIntegration.user_id;
        if (topic === 'customers/create' && req.body) {
          await processCustomerCreate(userId, req.body, normalizedDomain);
          // Trigger customer_created automations
          const payloadObj = (typeof req.body === 'object' && req.body !== null) ? (req.body as Record<string, unknown>) : {};
          const email = String(payloadObj.email ?? '').trim().toLowerCase();
          if (email) {
            const contactRes = await db.queryDb<{ id: string }>(
              `SELECT id FROM contacts WHERE user_id = $1 AND email = $2 LIMIT 1`, [userId, email]
            );
            const contactId = contactRes.rows[0]?.id;
            if (contactId) await triggerAutomationsInline('customer_created', contactId, userId, req.body);
          }
        } else if (topic === 'orders/paid' && req.body) {
          const payloadObj = (typeof req.body === 'object' && req.body !== null) ? (req.body as Record<string, unknown>) : {};
          const email = String(payloadObj.email ?? '').trim().toLowerCase();
          if (email) {
            const contactRes = await db.queryDb<{ id: string }>(
              `SELECT id FROM contacts WHERE user_id = $1 AND email = $2 LIMIT 1`, [userId, email]
            );
            const contactId = contactRes.rows[0]?.id;
            if (contactId) await triggerAutomationsInline('order_paid', contactId, userId, req.body);
          }
        }
      }

      // 5. Also enqueue for full processing (requires Redis — non-blocking)
      try {
        const queue = getQueue('webhook-processing');
        await Promise.race([
          queue.add(topic || 'unknown', {
            webhookEventId: webhookId,
            topic,
            shopDomain: normalizedDomain,
            payload: req.body,
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('BullMQ timeout')), 2000)),
        ]);
        await queue.close();
      } catch (err) {
        console.warn('[shoplazza-webhook] BullMQ unavailable (Redis not running?), processed inline:', err instanceof Error ? err.message : err);
      }

      // 5. Return 200 immediately
      return reply.send({ ok: true });
    }
  );
}

/** Process customers/create webhook: upsert contact */
async function processCustomerCreate(userId: string, payload: unknown, shopDomain: string) {
  const customer = typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};

  const email = String(customer.email ?? '').trim().toLowerCase();
  if (!email) return;

  const firstName = customer.first_name != null ? String(customer.first_name) : null;
  const lastName = customer.last_name != null ? String(customer.last_name) : null;
  const name = [firstName, lastName].filter(Boolean).join(' ') || null;
  const customerId = customer.id != null ? String(customer.id) : null;

  await db.upsertContact({
    user_id: userId,
    email,
    name,
    shoplazza_customer_id: customerId,
    source: 'shoplazza_sync',
  });

  console.log(`[shoplazza] Contact upserted from customers/create: ${email} (domain: ${shopDomain})`);
}

export { processCustomerCreate };
