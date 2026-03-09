import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from '../../../db/index.js';
import { fetchShoplazzaProducts, fetchShoplazzaShop, normalizeDomain } from '../../../lib/shoplazza.js';

interface AuthorizeBody {
  domain: string;
  token: string;
}

interface LastBody {
  shopId: string;
}

interface ProductsQuery {
  search?: string;
  cursor?: string;
  limit?: string;
}

function getUserId(req: FastifyRequest): string {
  return (req as FastifyRequest & { userId: string }).userId;
}

export async function registerShopsRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/shops - 當前用戶的授權店鋪列表 + 上次選中的 id */
  app.get('/api/shops', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserId(req);
    const [shops, lastSelectedId] = await Promise.all([
      db.listShopAuthorizationsByUserId(userId),
      db.getUserLastSelectedShopId(userId),
    ]);
    const list = shops.map((s) => ({
      id: s.id,
      shopId: s.shop_id,
      shopName: s.shop_name,
      shopUrl: s.shop_url ?? s.domain,
      domain: s.domain,
    }));
    return reply.send({ shops: list, lastSelectedId });
  });

  /** POST /api/shops/authorize - 填寫域名 + token，調 Shoplazza 驗證後寫入/更新 */
  app.post<{ Body: AuthorizeBody }>(
    '/api/shops/authorize',
    async (req: FastifyRequest<{ Body: AuthorizeBody }>, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { domain, token } = req.body ?? {};
      if (!domain || typeof domain !== 'string' || !token || typeof token !== 'string') {
        return reply.status(400).send({ error: '请填写店铺域名和 Token' });
      }
      const normalizedDomain = normalizeDomain(domain);
      if (!normalizedDomain) {
        return reply.status(400).send({ error: '店铺域名不能為空' });
      }

      try {
        const info = await fetchShoplazzaShop(normalizedDomain, token.trim());
        const now = Date.now();
        const existing = await db.getShopAuthorizationByUserAndDomain(userId, normalizedDomain);
        const id = existing?.id ?? nanoid();
        await db.createOrUpdateShopAuthorization({
          id,
          user_id: userId,
          domain: normalizedDomain,
          token: token.trim(),
          shop_id: info.shopId,
          shop_name: info.shopName,
          shop_url: info.shopUrl,
          created_at: now,
        });
        const row = await db.getShopAuthorizationByUserAndDomain(userId, normalizedDomain);
        if (!row) return reply.status(500).send({ error: '保存失败' });
        return reply.send({
          id: row.id,
          shopId: row.shop_id,
          shopName: row.shop_name,
          shopUrl: row.shop_url ?? row.domain,
          domain: row.domain,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '授权失败';
        return reply.status(400).send({ error: message });
      }
    }
  );

  /** PUT /api/shops/last - 記錄當前用戶上次選中的店鋪 */
  app.put<{ Body: LastBody }>(
    '/api/shops/last',
    async (req: FastifyRequest<{ Body: LastBody }>, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { shopId } = req.body ?? {};
      if (!shopId || typeof shopId !== 'string') {
        return reply.status(400).send({ error: '请提供 shopId' });
      }
      const shop = await db.getShopAuthorizationById(shopId, userId);
      if (!shop) {
        return reply.status(404).send({ error: '该店铺不存在或不属于当前用户' });
      }
      await db.updateUserLastSelectedShopId(userId, shopId);
      return reply.send({ ok: true });
    }
  );

  /** GET /api/shops/:shopId/products - 获取当前用户授权店铺的商品列表 */
  app.get<{ Params: { shopId: string }; Querystring: ProductsQuery }>(
    '/api/shops/:shopId/products',
    async (req: FastifyRequest<{ Params: { shopId: string }; Querystring: ProductsQuery }>, reply: FastifyReply) => {
      const userId = getUserId(req);
      const { shopId } = req.params;
      const auth = await db.getShopAuthorizationById(shopId, userId);
      if (!auth) {
        return reply.status(404).send({ error: '该店铺不存在或不属于当前用户' });
      }
      const limitRaw = Number(req.query?.limit ?? 20);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;

      try {
        const data = await fetchShoplazzaProducts(auth.domain, auth.token, {
          search: req.query?.search,
          cursor: req.query?.cursor,
          limit,
        });
        return reply.send({
          products: data.products,
          cursor: data.cursor,
          preCursor: data.preCursor,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '获取商品列表失败';
        return reply.status(400).send({ error: message });
      }
    }
  );

  /** DELETE /api/shops/:id - 解除店鋪授權 */
  app.delete<{ Params: { id: string } }>(
    '/api/shops/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = getUserId(req);
      const ok = await db.deleteShopAuthorization(req.params.id, userId);
      if (!ok) return reply.status(404).send({ error: '未找到该授权' });
      return reply.send({ ok: true });
    }
  );
}
