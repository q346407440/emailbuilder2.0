/**
 * 分組路由（Iteration 3）
 * GET    /api/segments               列表
 * POST   /api/segments               創建
 * PUT    /api/segments/:id           更新名稱
 * DELETE /api/segments/:id           軟刪除
 * GET    /api/segments/:id/contacts  分組聯繫人（分頁）
 * POST   /api/segments/:id/contacts  加入聯繫人
 * DELETE /api/segments/:id/contacts/:contactId  移除聯繫人
 * GET    /api/segments/:id/count     實時人數
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as db from '../db/index.js';

type AuthRequest = FastifyRequest & { userId: string };

function getUserId(req: FastifyRequest): string {
  return (req as AuthRequest).userId;
}

export async function registerSegmentsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/segments ──────────────────────────────────────────────────────
  app.get('/api/segments', async (req, reply) => {
    const userId = getUserId(req);
    const segments = await db.listSegments(userId);
    return reply.send(segments.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      count: s.count_cache,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    })));
  });

  // ── POST /api/segments ─────────────────────────────────────────────────────
  app.post<{ Body: { name: string } }>('/api/segments', async (req, reply) => {
    const userId = getUserId(req);
    const name = req.body?.name?.trim();
    if (!name) return reply.status(400).send({ error: '分組名稱不能為空' });
    if (name.length > 100) return reply.status(400).send({ error: '名稱最多 100 字元' });

    const segment = await db.createSegment(userId, name);
    return reply.status(201).send({
      id: segment.id,
      name: segment.name,
      type: segment.type,
      count: 0,
      createdAt: segment.created_at,
    });
  });

  // ── PUT /api/segments/:id ──────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { name: string } }>(
    '/api/segments/:id',
    async (req, reply) => {
      const userId = getUserId(req);
      const name = req.body?.name?.trim();
      if (!name) return reply.status(400).send({ error: '名稱不能為空' });
      const ok = await db.updateSegment(req.params.id, userId, name);
      if (!ok) return reply.status(404).send({ error: '分組不存在' });
      return reply.send({ ok: true });
    }
  );

  // ── DELETE /api/segments/:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/segments/:id', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.softDeleteSegment(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '分組不存在' });
    return reply.send({ ok: true });
  });

  // ── GET /api/segments/:id/contacts ─────────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string; search?: string } }>(
    '/api/segments/:id/contacts',
    async (req, reply) => {
      const userId = getUserId(req);
      const segment = await db.getSegmentById(req.params.id, userId);
      if (!segment) return reply.status(404).send({ error: '分組不存在' });

      const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '50', 10)));

      const { rows, total } = await db.listContacts({
        userId,
        search: req.query.search,
        segmentId: req.params.id,
        page,
        pageSize,
      });

      return reply.send({
        data: rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          status: r.status,
          source: r.source,
          updatedAt: r.updated_at,
        })),
        total,
        page,
        pageSize,
      });
    }
  );

  // ── POST /api/segments/:id/contacts ────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { contactIds: string[] } }>(
    '/api/segments/:id/contacts',
    async (req, reply) => {
      const userId = getUserId(req);
      const segment = await db.getSegmentById(req.params.id, userId);
      if (!segment) return reply.status(404).send({ error: '分組不存在' });

      const { contactIds } = req.body ?? {};
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return reply.status(400).send({ error: '請提供 contactIds 數組' });
      }

      await db.addContactsToSegment(req.params.id, contactIds);
      const count = await db.refreshSegmentCount(req.params.id);
      return reply.send({ ok: true, count });
    }
  );

  // ── DELETE /api/segments/:id/contacts/:contactId ───────────────────────────
  app.delete<{ Params: { id: string; contactId: string } }>(
    '/api/segments/:id/contacts/:contactId',
    async (req, reply) => {
      const userId = getUserId(req);
      const segment = await db.getSegmentById(req.params.id, userId);
      if (!segment) return reply.status(404).send({ error: '分組不存在' });
      await db.removeContactFromSegment(req.params.id, req.params.contactId);
      const count = await db.refreshSegmentCount(req.params.id);
      return reply.send({ ok: true, count });
    }
  );

  // ── GET /api/segments/:id/count ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/segments/:id/count', async (req, reply) => {
    const userId = getUserId(req);
    const segment = await db.getSegmentById(req.params.id, userId);
    if (!segment) return reply.status(404).send({ error: '分組不存在' });
    const count = await db.refreshSegmentCount(req.params.id);
    return reply.send({ count });
  });
}
