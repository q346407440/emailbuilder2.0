/**
 * 聯繫人路由（Iteration 3）
 * GET    /api/contacts               列表（分頁+搜索+篩選）
 * GET    /api/contacts/:id           詳情
 * PUT    /api/contacts/:id           更新（name、status）
 * DELETE /api/contacts/:id           軟刪除
 * POST   /api/contacts/batch         批量操作
 * POST   /api/contacts/import        CSV 導入（接收解析後的行數組）
 * GET    /api/contacts/import/:jobId/status  輪詢進度
 * POST   /api/contacts/unsubscribe   公開退訂（用 token）
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as db from '../db/index.js';

type AuthRequest = FastifyRequest & { userId: string };

function getUserId(req: FastifyRequest): string {
  return (req as AuthRequest).userId;
}

interface ContactsQuery {
  search?: string;
  status?: string;
  segmentId?: string;
  page?: string;
  pageSize?: string;
}

interface ImportRow {
  email: string;
  name?: string;
}

interface ImportBody {
  rows: ImportRow[];
  duplicateStrategy?: 'update' | 'skip';
  segmentId?: string;
}

interface BatchBody {
  action: 'add_to_segment' | 'unsubscribe' | 'delete';
  ids: string[];
  segmentId?: string;
}

export async function registerContactsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/contacts ──────────────────────────────────────────────────────
  app.get<{ Querystring: ContactsQuery }>('/api/contacts', async (req, reply) => {
    const userId = getUserId(req);
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '50', 10)));

    const { rows, total } = await db.listContacts({
      userId,
      search: req.query.search,
      status: req.query.status,
      segmentId: req.query.segmentId,
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
        shoplazzaCustomerId: r.shoplazza_customer_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      page,
      pageSize,
    });
  });

  // ── GET /api/contacts/import/:jobId/status ─────────────────────────────────
  // Must come BEFORE /:id to avoid conflict
  app.get<{ Params: { jobId: string } }>('/api/contacts/import/:jobId/status', async (req, reply) => {
    const userId = getUserId(req);
    const job = await db.getImportJob(req.params.jobId, userId);
    if (!job) return reply.status(404).send({ error: '找不到導入任務' });
    return reply.send({
      jobId: job.id,
      status: job.status,
      total: job.total,
      processed: job.processed,
      skipped: job.skipped,
      errors: job.errors,
      errorDetails: job.error_details,
    });
  });

  // ── GET /api/contacts/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/contacts/:id', async (req, reply) => {
    const userId = getUserId(req);
    const contact = await db.getContactById(req.params.id, userId);
    if (!contact) return reply.status(404).send({ error: '聯繫人不存在' });

    const segments = await db.getContactSegments(contact.id);
    return reply.send({
      id: contact.id,
      email: contact.email,
      name: contact.name,
      status: contact.status,
      source: contact.source,
      shoplazzaCustomerId: contact.shoplazza_customer_id,
      segments,
      createdAt: contact.created_at,
      updatedAt: contact.updated_at,
    });
  });

  // ── PUT /api/contacts/:id ──────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { name?: string | null; status?: string } }>(
    '/api/contacts/:id',
    async (req, reply) => {
      const userId = getUserId(req);
      const { name, status } = req.body ?? {};
      const ok = await db.updateContact(req.params.id, userId, { name, status });
      if (!ok) return reply.status(404).send({ error: '聯繫人不存在' });
      return reply.send({ ok: true });
    }
  );

  // ── DELETE /api/contacts/:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/contacts/:id', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.softDeleteContact(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '聯繫人不存在' });
    return reply.send({ ok: true });
  });

  // ── POST /api/contacts/batch ───────────────────────────────────────────────
  app.post<{ Body: BatchBody }>('/api/contacts/batch', async (req, reply) => {
    const userId = getUserId(req);
    const { action, ids, segmentId } = req.body ?? {};
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: '請提供 action 和 ids' });
    }

    let affected = 0;
    if (action === 'unsubscribe') {
      for (const id of ids) {
        const ok = await db.updateContact(id, userId, { status: 'unsubscribed' });
        if (ok) affected++;
      }
    } else if (action === 'delete') {
      for (const id of ids) {
        const ok = await db.softDeleteContact(id, userId);
        if (ok) affected++;
      }
    } else if (action === 'add_to_segment') {
      if (!segmentId) return reply.status(400).send({ error: '請提供 segmentId' });
      const segment = await db.getSegmentById(segmentId, userId);
      if (!segment) return reply.status(404).send({ error: '分組不存在' });
      await db.addContactsToSegment(segmentId, ids);
      affected = ids.length;
    }

    return reply.send({ ok: true, affected });
  });

  // ── POST /api/contacts/import ──────────────────────────────────────────────
  app.post<{ Body: ImportBody }>('/api/contacts/import', async (req, reply) => {
    const userId = getUserId(req);
    const { rows, duplicateStrategy = 'update', segmentId } = req.body ?? {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return reply.status(400).send({ error: '請提供 rows 數組' });
    }
    if (rows.length > 10000) {
      return reply.status(400).send({ error: '單次導入最多 10,000 行' });
    }

    // Validate target segment belongs to user
    if (segmentId) {
      const seg = await db.getSegmentById(segmentId, userId);
      if (!seg) return reply.status(404).send({ error: '分組不存在' });
    }

    // Create job record
    const jobId = await db.createImportJob(userId, rows.length, segmentId);

    // Process inline asynchronously (setImmediate to not block response)
    const jobRow = { processed: 0, skipped: 0, errors: 0, errorDetails: [] as string[] };

    void (async () => {
      try {
        const addedIds: string[] = [];
        for (const row of rows) {
          const email = (typeof row.email === 'string' ? row.email : '').trim().toLowerCase();
          if (!email || !email.includes('@')) {
            jobRow.errors++;
            jobRow.errorDetails.push(`Invalid email: ${String(row.email ?? '')}`);
            continue;
          }

          try {
            // Check if contact exists
            const existingRes = await db.queryDb<{ id: string; status: string }>(
              `SELECT id, status FROM contacts WHERE user_id = $1 AND email = $2`,
              [userId, email]
            );
            const existing = existingRes.rows[0];

            if (existing) {
              if (duplicateStrategy === 'skip') {
                jobRow.skipped++;
              } else {
                // update
                await db.updateContact(existing.id, userId, { name: row.name?.trim() || null });
                addedIds.push(existing.id);
                jobRow.processed++;
              }
            } else {
              await db.upsertContact({ user_id: userId, email, name: row.name?.trim() || null, source: 'csv_import' });
              const newRes = await db.queryDb<{ id: string }>(
                `SELECT id FROM contacts WHERE user_id = $1 AND email = $2`,
                [userId, email]
              );
              if (newRes.rows[0]) addedIds.push(newRes.rows[0].id);
              jobRow.processed++;
            }
          } catch (err) {
            jobRow.errors++;
            jobRow.errorDetails.push(`${email}: ${err instanceof Error ? err.message : 'error'}`);
          }
        }

        // Add to segment
        if (segmentId && addedIds.length > 0) {
          await db.addContactsToSegment(segmentId, addedIds);
        }

        await db.updateImportJob(jobId, {
          status: 'completed',
          processed: jobRow.processed,
          skipped: jobRow.skipped,
          errors: jobRow.errors,
          errorDetails: jobRow.errorDetails,
        });
      } catch (err) {
        await db.updateImportJob(jobId, {
          status: 'failed',
          errors: rows.length,
          errorDetails: [err instanceof Error ? err.message : 'unknown error'],
        });
      }
    })();

    // Return jobId immediately
    return reply.status(202).send({ jobId });
  });

  // ── POST /api/contacts/unsubscribe (public, no JWT) ───────────────────────
  app.post<{ Querystring: { token: string } }>('/api/contacts/unsubscribe', async (req, reply) => {
    const token = req.query.token?.trim();
    if (!token) return reply.status(400).send({ error: '缺少 token' });

    const contact = await db.getContactByUnsubToken(token);
    if (!contact) return reply.status(404).send({ error: 'token 無效或已過期' });

    await db.queryDb(
      `UPDATE contacts SET status = 'unsubscribed', updated_at = NOW() WHERE id = $1`,
      [contact.id]
    );
    return reply.send({ ok: true, email: contact.email });
  });
}
