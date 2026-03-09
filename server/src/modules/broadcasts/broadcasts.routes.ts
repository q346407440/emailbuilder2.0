/**
 * 廣播活動路由（Iteration 4）
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import { nanoid } from 'nanoid';
import * as db from '../../db/index.js';
import { getEmailProvider, getFromInfo, getAppBaseUrl } from '../../lib/emailProvider.js';
import { withCache } from '../../lib/analyticsCache.js';

type AuthRequest = FastifyRequest & { userId: string };

function getUserId(req: FastifyRequest): string {
  return (req as AuthRequest).userId;
}

function parseBullMQConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const u = new URL(url);
    return { host: u.hostname, port: parseInt(u.port || '6379', 10), password: u.password || undefined, enableOfflineQueue: false, connectTimeout: 1000, maxRetriesPerRequest: 1 };
  } catch {
    return { host: 'localhost', port: 6379, enableOfflineQueue: false, connectTimeout: 1000, maxRetriesPerRequest: 1 };
  }
}

export async function registerBroadcastsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/broadcasts ───────────────────────────────────────────────────
  app.get<{ Querystring: { status?: string; page?: string; pageSize?: string } }>(
    '/api/broadcasts',
    async (req, reply) => {
      const userId = getUserId(req);
      const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize ?? '20', 10)));
      const { rows, total } = await db.listBroadcasts(userId, { status: req.query.status, page, pageSize });

      // Enrich with segment name and template preview
      const enriched = await Promise.all(rows.map(async (b) => {
        let segmentName: string | null = null;
        let segmentCount = 0;
        if (b.segment_id) {
          const seg = await db.getSegmentById(b.segment_id, userId);
          segmentName = seg?.name ?? null;
          segmentCount = seg?.count_cache ?? 0;
        }
        return {
          id: b.id, name: b.name, subject: b.subject, status: b.status,
          templateId: b.template_id, segmentId: b.segment_id, segmentName, segmentCount,
          scheduledAt: b.scheduled_at, sentAt: b.sent_at,
          totalCount: b.total_count, sentCount: b.sent_count, failedCount: b.failed_count,
          createdAt: b.created_at, updatedAt: b.updated_at,
        };
      }));

      return reply.send({ data: enriched, total, page, pageSize });
    }
  );

  // ── POST /api/broadcasts ──────────────────────────────────────────────────
  app.post<{ Body: { name: string; subject: string; previewText?: string } }>(
    '/api/broadcasts',
    async (req, reply) => {
      const userId = getUserId(req);
      const { name, subject, previewText } = req.body ?? {};
      if (!name?.trim()) return reply.status(400).send({ error: '請填寫活動名稱' });
      if (!subject?.trim()) return reply.status(400).send({ error: '請填寫郵件主旨' });
      const b = await db.createBroadcast(userId, { name, subject, previewText });
      return reply.status(201).send({ id: b.id });
    }
  );

  // ── GET /api/broadcasts/:id ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/broadcasts/:id', async (req, reply) => {
    const userId = getUserId(req);
    const b = await db.getBroadcastById(req.params.id, userId);
    if (!b) return reply.status(404).send({ error: '廣播活動不存在' });

    let segmentName: string | null = null;
    let segmentCount = 0;
    if (b.segment_id) {
      const seg = await db.getSegmentById(b.segment_id, userId);
      segmentName = seg?.name ?? null;
      segmentCount = seg?.count_cache ?? 0;
    }

    let templatePreviewUrl: string | null = null;
    let templateTitle: string | null = null;
    if (b.template_id) {
      const t = await db.getTemplate(b.template_id);
      templatePreviewUrl = t?.preview_url ?? null;
      templateTitle = t?.title ?? null;
    }

    return reply.send({
      id: b.id, name: b.name, subject: b.subject, previewText: b.preview_text, status: b.status,
      templateId: b.template_id, templateTitle, templatePreviewUrl,
      segmentId: b.segment_id, segmentName, segmentCount,
      scheduledAt: b.scheduled_at, sentAt: b.sent_at,
      totalCount: b.total_count, sentCount: b.sent_count, failedCount: b.failed_count,
      createdAt: b.created_at, updatedAt: b.updated_at,
    });
  });

  // ── PUT /api/broadcasts/:id ───────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/broadcasts/:id',
    async (req, reply) => {
      const userId = getUserId(req);
      const body = req.body ?? {};
      const ok = await db.updateBroadcast(req.params.id, userId, {
        name: body.name as string | undefined,
        subject: body.subject as string | undefined,
        previewText: body.previewText as string | undefined,
        templateId: body.templateId as string | null | undefined,
        segmentId: body.segmentId as string | null | undefined,
        renderedHtml: body.renderedHtml as string | null | undefined,
        scheduledAt: body.scheduledAt as string | null | undefined,
      });
      if (!ok) return reply.status(404).send({ error: '廣播活動不存在' });
      return reply.send({ ok: true });
    }
  );

  // ── DELETE /api/broadcasts/:id ────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/broadcasts/:id', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.softDeleteBroadcast(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '廣播活動不存在' });
    return reply.send({ ok: true });
  });

  // ── POST /api/broadcasts/:id/publish ─────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { renderedHtml?: string } }>(
    '/api/broadcasts/:id/publish',
    async (req, reply) => {
      const userId = getUserId(req);
      const b = await db.getBroadcastById(req.params.id, userId);
      if (!b) return reply.status(404).send({ error: '廣播活動不存在' });
      if (b.status !== 'draft' && b.status !== 'paused') {
        return reply.status(400).send({ error: `當前狀態 ${b.status} 不可發布` });
      }
      if (!b.template_id) return reply.status(400).send({ error: '請先選擇郵件模板' });
      if (!b.segment_id) return reply.status(400).send({ error: '請先選擇受眾分組' });
      if (!b.subject?.trim()) return reply.status(400).send({ error: '請填寫郵件主旨' });

      // Store rendered HTML if provided
      if (req.body?.renderedHtml) {
        await db.updateBroadcast(req.params.id, userId, { renderedHtml: req.body.renderedHtml });
      }

      // Determine if scheduled or immediate
      const isScheduled = !!(b.scheduled_at && new Date(b.scheduled_at) > new Date());
      const newStatus = isScheduled ? 'scheduled' : 'sending';
      await db.updateBroadcast(req.params.id, userId, { status: newStatus });

      // Enqueue broadcast job
      try {
        const queue = new Queue('broadcast-send', { connection: parseBullMQConnection() });
        await Promise.race([
          queue.add('send', { broadcastId: b.id, userId }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
        ]);
        await queue.close();
      } catch (err) {
        console.warn('[broadcasts] BullMQ unavailable, processing inline:', err instanceof Error ? err.message : err);
        // Inline fallback: process asynchronously
        void processBroadcastInline(b.id, userId);
      }

      return reply.status(202).send({ status: newStatus });
    }
  );

  // ── POST /api/broadcasts/:id/pause ────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/broadcasts/:id/pause', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.updateBroadcast(req.params.id, userId, { status: 'paused' });
    if (!ok) return reply.status(404).send({ error: '廣播活動不存在' });
    return reply.send({ ok: true });
  });

  // ── GET /api/broadcasts/:id/progress ─────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/broadcasts/:id/progress', async (req, reply) => {
    const userId = getUserId(req);
    const b = await db.getBroadcastById(req.params.id, userId);
    if (!b) return reply.status(404).send({ error: '廣播活動不存在' });
    return reply.send({
      sentCount: b.sent_count, totalCount: b.total_count, failedCount: b.failed_count, status: b.status,
    });
  });

  // ── POST /api/broadcasts/:id/send-test ────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { email: string; renderedHtml?: string } }>(
    '/api/broadcasts/:id/send-test',
    async (req, reply) => {
      const userId = getUserId(req);
      const { email, renderedHtml } = req.body ?? {};
      if (!email?.trim()) return reply.status(400).send({ error: '請填寫測試郵箱' });

      const b = await db.getBroadcastById(req.params.id, userId);
      if (!b) return reply.status(404).send({ error: '廣播活動不存在' });

      const html = renderedHtml ?? b.rendered_html ?? '<p>（測試郵件，模板尚未渲染）</p>';
      const { fromName, fromEmail } = getFromInfo();
      const provider = getEmailProvider();

      const result = await provider.send({
        to: email.trim(),
        subject: `[測試] ${b.subject}`,
        html,
        fromName,
        fromEmail,
        previewText: b.preview_text ?? undefined,
        messageId: `test-${nanoid()}@${fromEmail.split('@')[1] ?? 'mail'}`,
      });

      if (result.status === 'failed') {
        return reply.status(500).send({ error: result.error ?? '發送失敗' });
      }
      return reply.send({ ok: true, messageId: result.messageId });
    }
  );

  // ── Tracking: pixel ───────────────────────────────────────────────────────
  app.get<{ Params: { sendId: string } }>('/tracking/pixel/:sendId.gif', async (req, reply) => {
    const { sendId } = req.params;
    const sendIdClean = sendId.replace(/\.gif$/, '');
    // Record open event (best-effort)
    try {
      const send = await db.getEmailSendById(sendIdClean);
      if (send) {
        await db.insertEmailEvent({ sendId: sendIdClean, type: 'open' });
        await db.queryDb(
          `UPDATE email_sends SET opened_at = COALESCE(opened_at, NOW()) WHERE id = $1`,
          [sendIdClean]
        );
      }
    } catch { /* best-effort */ }

    // Return 1x1 transparent GIF
    const gifBytes = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    reply.header('Content-Type', 'image/gif');
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return reply.send(gifBytes);
  });

  // ── Tracking: click redirect ──────────────────────────────────────────────
  app.get<{ Params: { linkId: string } }>('/tracking/click/:linkId', async (req, reply) => {
    const { linkId } = req.params;
    try {
      const link = await db.getTrackingLink(linkId);
      if (link) {
        await db.insertEmailEvent({ sendId: link.send_id, type: 'click', meta: { url: link.original_url } });
        await db.queryDb(
          `UPDATE email_sends SET clicked_at = COALESCE(clicked_at, NOW()) WHERE id = $1`,
          [link.send_id]
        );
        return reply.redirect(link.original_url);
      }
    } catch { /* best-effort */ }
    return reply.redirect(getAppBaseUrl());
  });
}

// ─── Inline broadcast processing (fallback when Redis is unavailable) ─────────

async function processBroadcastInline(broadcastId: string, userId: string): Promise<void> {
  try {
    const b = await db.getBroadcastById(broadcastId, userId);
    if (!b || b.status === 'paused') return;

    if (!b.segment_id) {
      await db.updateBroadcast(broadcastId, userId, { status: 'failed' });
      return;
    }

    const { fromName, fromEmail } = getFromInfo();
    const provider = getEmailProvider();
    const baseUrl = getAppBaseUrl();

    const html = b.rendered_html ?? '<p>（模板 HTML 尚未生成）</p>';

    // Process contacts in batches
    let page = 1;
    let totalProcessed = 0;
    let sentOk = 0;
    let sentFailed = 0;

    while (true) {
      const { rows: contacts } = await db.listContacts({
        userId,
        segmentId: b.segment_id,
        status: 'subscribed',
        page,
        pageSize: 100,
      });
      if (contacts.length === 0) break;

      for (const contact of contacts) {
        if (!contact.email) continue;

        // Ensure unsubscribe token
        const unsubToken = await db.ensureUnsubscribeToken(contact.id, userId);

        // Inject unsubscribe link + tracking pixel
        const sendId = await db.createEmailSend({ broadcastId, contactId: contact.id, userId });
        const pixelUrl = `${baseUrl}/tracking/pixel/${sendId}.gif`;
        const unsubUrl = `${baseUrl.replace(':3001', ':5173')}/unsubscribe?token=${unsubToken}`;

        let personalizedHtml = html;
        // Inject tracking pixel before </body>
        personalizedHtml = personalizedHtml.replace(
          /<\/body>/i,
          `<img src="${pixelUrl}" width="1" height="1" style="display:none" /></body>`
        );
        // Inject unsubscribe link
        if (!personalizedHtml.includes('unsubscribe')) {
          personalizedHtml = personalizedHtml.replace(
            /<\/body>/i,
            `<p style="text-align:center;font-size:11px;color:#aaa;margin:20px 0">
              <a href="${unsubUrl}" style="color:#aaa">退訂</a>
            </p></body>`
          );
        }

        const messageId = `${sendId}@${fromEmail.split('@')[1] ?? 'mail'}`;
        const result = await provider.send({
          to: contact.email,
          subject: b.subject,
          html: personalizedHtml,
          fromName,
          fromEmail,
          previewText: b.preview_text ?? undefined,
          messageId,
        });

        if (result.status === 'sent') {
          await db.updateEmailSend(sendId, { status: 'sent', messageId: result.messageId, sentAt: new Date().toISOString() });
          await db.incrementBroadcastCount(broadcastId, 'sent_count');
          sentOk++;
        } else {
          await db.updateEmailSend(sendId, { status: 'failed' });
          await db.incrementBroadcastCount(broadcastId, 'failed_count');
          sentFailed++;
        }
        totalProcessed++;
      }

      if (contacts.length < 100) break;
      page++;
    }

    await db.updateBroadcast(broadcastId, userId, {
      status: 'completed',
      totalCount: totalProcessed,
      sentAt: new Date().toISOString(),
    });
    console.log(`[broadcasts] Inline send completed: ${sentOk} sent, ${sentFailed} failed, total: ${totalProcessed}`);
  } catch (err) {
    console.error('[broadcasts] Inline processing failed:', err);
    await db.updateBroadcast(broadcastId, userId, { status: 'failed' }).catch(() => {});
  }
}

export { processBroadcastInline };

// ─── Analytics endpoints (Iteration 6) ────────────────────────────────────────

export async function registerBroadcastAnalyticsRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/broadcasts/:id/stats
  app.get<{ Params: { id: string } }>('/api/broadcasts/:id/stats', async (req, reply) => {
    const userId = getUserId(req);
    const b = await db.getBroadcastById(req.params.id, userId);
    if (!b) return reply.status(404).send({ error: '廣播活動不存在' });

    const stats = await withCache(`broadcast:stats:${req.params.id}`, 300, async () => {
      const pool = db.queryDb.bind(db);

      const [sentRes, openRes, clickRes, unsubRes] = await Promise.all([
        pool(`SELECT COUNT(*) as cnt FROM email_sends WHERE broadcast_id = $1`, [req.params.id]),
        pool(`SELECT COUNT(DISTINCT es.contact_id) as cnt FROM email_sends es
              JOIN email_events ee ON ee.send_id = es.id
              WHERE es.broadcast_id = $1 AND ee.type = 'open'`, [req.params.id]),
        pool(`SELECT COUNT(DISTINCT es.contact_id) as cnt FROM email_sends es
              JOIN email_events ee ON ee.send_id = es.id
              WHERE es.broadcast_id = $1 AND ee.type = 'click'`, [req.params.id]),
        pool(`SELECT COUNT(DISTINCT es.contact_id) as cnt FROM email_sends es
              JOIN email_events ee ON ee.send_id = es.id
              WHERE es.broadcast_id = $1 AND ee.type = 'unsubscribe'`, [req.params.id]),
      ]);

      const sent = parseInt((sentRes.rows[0] as { cnt: string }).cnt ?? '0', 10);
      const opens = parseInt((openRes.rows[0] as { cnt: string }).cnt ?? '0', 10);
      const clicks = parseInt((clickRes.rows[0] as { cnt: string }).cnt ?? '0', 10);
      const unsubs = parseInt((unsubRes.rows[0] as { cnt: string }).cnt ?? '0', 10);

      return {
        sent, delivered: b.sent_count, opens, clicks, unsubs,
        openRate: sent > 0 ? opens / sent : 0,
        clickRate: sent > 0 ? clicks / sent : 0,
        unsubRate: sent > 0 ? unsubs / sent : 0,
        deliveryRate: sent > 0 ? b.sent_count / sent : 0,
      };
    });

    return reply.send(stats);
  });

  // GET /api/broadcasts/:id/trends
  app.get<{ Params: { id: string } }>('/api/broadcasts/:id/trends', async (req, reply) => {
    const userId = getUserId(req);
    const b = await db.getBroadcastById(req.params.id, userId);
    if (!b) return reply.status(404).send({ error: '廣播活動不存在' });

    const trends = await withCache(`broadcast:trends:${req.params.id}`, 300, async () => {
      const sentAt = b.sent_at ?? b.created_at;
      const startTime = new Date(sentAt);
      const endTime = new Date(startTime.getTime() + 72 * 3600 * 1000);

      const res = await db.queryDb<{ hour: string; type: string; cnt: string }>(
        `SELECT date_trunc('hour', ee.created_at) as hour, ee.type, COUNT(*) as cnt
         FROM email_events ee
         JOIN email_sends es ON es.id = ee.send_id
         WHERE es.broadcast_id = $1
           AND ee.type IN ('open', 'click')
           AND ee.created_at BETWEEN $2 AND $3
         GROUP BY hour, ee.type
         ORDER BY hour ASC`,
        [req.params.id, startTime.toISOString(), endTime.toISOString()]
      );

      // Build hourly data map
      const hourMap = new Map<string, { opens: number; clicks: number }>();
      for (const row of res.rows) {
        const h = new Date(row.hour).toISOString();
        if (!hourMap.has(h)) hourMap.set(h, { opens: 0, clicks: 0 });
        const entry = hourMap.get(h)!;
        if (row.type === 'open') entry.opens += parseInt(row.cnt, 10);
        if (row.type === 'click') entry.clicks += parseInt(row.cnt, 10);
      }

      return Array.from(hourMap.entries()).map(([hour, v]) => ({
        hour, opens: v.opens, clicks: v.clicks,
      }));
    });

    return reply.send(trends);
  });

  // GET /api/broadcasts/:id/link-stats
  app.get<{ Params: { id: string } }>('/api/broadcasts/:id/link-stats', async (req, reply) => {
    const userId = getUserId(req);
    const b = await db.getBroadcastById(req.params.id, userId);
    if (!b) return reply.status(404).send({ error: '廣播活動不存在' });

    const linkStats = await withCache(`broadcast:links:${req.params.id}`, 300, async () => {
      const res = await db.queryDb<{ url: string; clicks: string; unique_clicks: string; last_click: string }>(
        `SELECT tl.original_url as url,
                COUNT(ee.id) as clicks,
                COUNT(DISTINCT es.contact_id) as unique_clicks,
                MAX(ee.created_at) as last_click
         FROM tracking_links tl
         JOIN email_sends es ON es.id = tl.send_id
         LEFT JOIN email_events ee ON ee.send_id = tl.send_id AND ee.type = 'click'
         WHERE es.broadcast_id = $1
         GROUP BY tl.original_url
         ORDER BY clicks DESC
         LIMIT 50`,
        [req.params.id]
      );

      const sent = b.sent_count || 1;
      return res.rows.map((r) => ({
        url: r.url,
        clicks: parseInt(r.clicks ?? '0', 10),
        uniqueClicks: parseInt(r.unique_clicks ?? '0', 10),
        clickRate: parseInt(r.unique_clicks ?? '0', 10) / sent,
        lastClick: r.last_click,
      }));
    });

    return reply.send(linkStats);
  });
}
