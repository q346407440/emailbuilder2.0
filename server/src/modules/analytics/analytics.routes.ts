/**
 * 全局數據分析路由（Iteration 6）
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as db from '../../db/index.js';
import { withCache } from '../../lib/analyticsCache.js';

type AuthRequest = FastifyRequest & { userId: string };
function getUserId(req: FastifyRequest): string { return (req as AuthRequest).userId; }

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/analytics/overview ───────────────────────────────────────────
  app.get<{ Querystring: { range?: string } }>('/api/analytics/overview', async (req, reply) => {
    const userId = getUserId(req);
    const range = req.query.range ?? '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

    const data = await withCache(`analytics:overview:${userId}:${range}`, 300, async () => {
      const since = new Date(Date.now() - days * 86400 * 1000);

      // Daily sends (broadcasts + automations)
      const dailyRes = await db.queryDb<{ day: string; type: string; cnt: string }>(
        `SELECT DATE(es.sent_at) as day,
                CASE WHEN es.broadcast_id IS NOT NULL THEN 'broadcast' ELSE 'automation' END as type,
                COUNT(*) as cnt
         FROM email_sends es
         WHERE es.user_id = $1 AND es.sent_at >= $2
         GROUP BY day, type
         ORDER BY day ASC`,
        [userId, since.toISOString()]
      );

      // Daily opens & clicks
      const eventsRes = await db.queryDb<{ day: string; type: string; cnt: string }>(
        `SELECT DATE(ee.created_at) as day, ee.type, COUNT(*) as cnt
         FROM email_events ee
         JOIN email_sends es ON es.id = ee.send_id
         WHERE es.user_id = $1 AND ee.created_at >= $2 AND ee.type IN ('open', 'click')
         GROUP BY day, ee.type
         ORDER BY day ASC`,
        [userId, since.toISOString()]
      );

      // Totals
      const totalRes = await db.queryDb<{ sent: string; opens: string; clicks: string }>(
        `SELECT
           COUNT(DISTINCT es.id) as sent,
           COUNT(DISTINCT CASE WHEN ee.type='open' THEN es.contact_id END) as opens,
           COUNT(DISTINCT CASE WHEN ee.type='click' THEN es.contact_id END) as clicks
         FROM email_sends es
         LEFT JOIN email_events ee ON ee.send_id = es.id
         WHERE es.user_id = $1 AND es.sent_at >= $2`,
        [userId, since.toISOString()]
      );
      const t = totalRes.rows[0] ?? { sent: '0', opens: '0', clicks: '0' };
      const sent = parseInt(t.sent ?? '0', 10);
      const opens = parseInt(t.opens ?? '0', 10);
      const clicks = parseInt(t.clicks ?? '0', 10);

      // Build day maps
      const dayMap = new Map<string, { broadcastSent: number; automationSent: number; opens: number; clicks: number }>();
      for (const r of dailyRes.rows) {
        const d = String(r.day).slice(0, 10);
        if (!dayMap.has(d)) dayMap.set(d, { broadcastSent: 0, automationSent: 0, opens: 0, clicks: 0 });
        const e = dayMap.get(d)!;
        if (r.type === 'broadcast') e.broadcastSent += parseInt(r.cnt, 10);
        else e.automationSent += parseInt(r.cnt, 10);
      }
      for (const r of eventsRes.rows) {
        const d = String(r.day).slice(0, 10);
        if (!dayMap.has(d)) dayMap.set(d, { broadcastSent: 0, automationSent: 0, opens: 0, clicks: 0 });
        const e = dayMap.get(d)!;
        if (r.type === 'open') e.opens += parseInt(r.cnt, 10);
        if (r.type === 'click') e.clicks += parseInt(r.cnt, 10);
      }

      return {
        range,
        totals: {
          sent, opens, clicks,
          openRate: sent > 0 ? opens / sent : 0,
          clickRate: sent > 0 ? clicks / sent : 0,
        },
        daily: Array.from(dayMap.entries()).map(([day, v]) => ({ day, ...v })),
      };
    });

    return reply.send(data);
  });

  // ── GET /api/analytics/campaigns-comparison ───────────────────────────────
  app.get('/api/analytics/campaigns-comparison', async (req, reply) => {
    const userId = getUserId(req);

    const data = await withCache(`analytics:campaigns:${userId}`, 300, async () => {
      // Broadcasts comparison
      const broadcastsRes = await db.queryDb<{
        id: string; name: string; status: string; sent_count: string;
        sent_at: string; opened: string; clicked: string;
      }>(
        `SELECT b.id, b.name, b.status, b.sent_count,
                b.sent_at,
                COUNT(DISTINCT CASE WHEN ee.type='open' THEN es.contact_id END) as opened,
                COUNT(DISTINCT CASE WHEN ee.type='click' THEN es.contact_id END) as clicked
         FROM broadcasts b
         LEFT JOIN email_sends es ON es.broadcast_id = b.id
         LEFT JOIN email_events ee ON ee.send_id = es.id
         WHERE b.user_id = $1 AND b.deleted_at IS NULL
         GROUP BY b.id ORDER BY b.created_at DESC LIMIT 20`,
        [userId]
      );

      // Automations comparison
      const autoRes = await db.queryDb<{
        id: string; name: string; status: string; trigger_type: string;
        enrollments: string; sent: string; opened: string; clicked: string;
      }>(
        `SELECT a.id, a.name, a.status, a.trigger_type,
                COUNT(DISTINCT ae.id) as enrollments,
                COUNT(DISTINCT es.id) as sent,
                COUNT(DISTINCT CASE WHEN ee.type='open' THEN es.contact_id END) as opened,
                COUNT(DISTINCT CASE WHEN ee.type='click' THEN es.contact_id END) as clicked
         FROM automations a
         LEFT JOIN automation_enrollments ae ON ae.automation_id = a.id
         LEFT JOIN email_sends es ON es.automation_id = a.id
         LEFT JOIN email_events ee ON ee.send_id = es.id
         WHERE a.user_id = $1 AND a.deleted_at IS NULL
         GROUP BY a.id ORDER BY a.created_at DESC LIMIT 20`,
        [userId]
      );

      const broadcasts = broadcastsRes.rows.map((b) => {
        const sent = parseInt(b.sent_count ?? '0', 10);
        const opens = parseInt(b.opened ?? '0', 10);
        const clicks = parseInt(b.clicked ?? '0', 10);
        return {
          id: b.id, name: b.name, type: 'broadcast', status: b.status,
          sent, opens, clicks, sentAt: b.sent_at,
          openRate: sent > 0 ? opens / sent : 0,
          clickRate: sent > 0 ? clicks / sent : 0,
        };
      });

      const automations = autoRes.rows.map((a) => {
        const sent = parseInt(a.sent ?? '0', 10);
        const opens = parseInt(a.opened ?? '0', 10);
        const clicks = parseInt(a.clicked ?? '0', 10);
        return {
          id: a.id, name: a.name, type: 'automation', status: a.status,
          triggerType: a.trigger_type,
          enrollments: parseInt(a.enrollments ?? '0', 10),
          sent, opens, clicks,
          openRate: sent > 0 ? opens / sent : 0,
          clickRate: sent > 0 ? clicks / sent : 0,
        };
      });

      return { broadcasts, automations };
    });

    return reply.send(data);
  });

  // ── GET /api/analytics/list-health ────────────────────────────────────────
  app.get('/api/analytics/list-health', async (req, reply) => {
    const userId = getUserId(req);

    const data = await withCache(`analytics:health:${userId}`, 300, async () => {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      }).reverse();

      const growth = await Promise.all(months.map(async ({ year, month }) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        const [newRes, unsubRes] = await Promise.all([
          db.queryDb<{ count: string }>(
            `SELECT COUNT(*) as count FROM contacts WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
            [userId, start.toISOString(), end.toISOString()]
          ),
          db.queryDb<{ count: string }>(
            `SELECT COUNT(*) as count FROM contacts WHERE user_id = $1 AND status = 'unsubscribed' AND updated_at >= $2 AND updated_at < $3`,
            [userId, start.toISOString(), end.toISOString()]
          ),
        ]);
        return {
          month: `${year}-${String(month).padStart(2, '0')}`,
          newContacts: parseInt(newRes.rows[0]?.count ?? '0', 10),
          unsubscribed: parseInt(unsubRes.rows[0]?.count ?? '0', 10),
        };
      }));

      // Total active subscribers
      const totalRes = await db.queryDb<{ count: string }>(
        `SELECT COUNT(*) as count FROM contacts WHERE user_id = $1 AND status = 'subscribed' AND deleted_at IS NULL`,
        [userId]
      );
      const totalActive = parseInt(totalRes.rows[0]?.count ?? '0', 10);

      // Active rate (opened in last 90 days / total)
      const activeRes = await db.queryDb<{ count: string }>(
        `SELECT COUNT(DISTINCT es.contact_id) as count
         FROM email_sends es JOIN email_events ee ON ee.send_id = es.id
         WHERE es.user_id = $1 AND ee.type = 'open' AND ee.created_at >= $2`,
        [userId, new Date(Date.now() - 90 * 86400 * 1000).toISOString()]
      );
      const activeOpeners = parseInt(activeRes.rows[0]?.count ?? '0', 10);

      return {
        growth,
        totalActive,
        activeRate: totalActive > 0 ? activeOpeners / totalActive : 0,
      };
    });

    return reply.send(data);
  });

  // ── GET /api/analytics/dashboard ──────────────────────────────────────────
  app.get('/api/analytics/dashboard', async (req, reply) => {
    const userId = getUserId(req);

    const data = await withCache(`analytics:dashboard:${userId}`, 180, async () => {
      const since30d = new Date(Date.now() - 30 * 86400 * 1000);

      const statsRes = await db.queryDb<{ sent: string; opens: string; clicks: string; unsubs: string }>(
        `SELECT
           COUNT(DISTINCT es.id) as sent,
           COUNT(DISTINCT CASE WHEN ee.type='open' THEN es.contact_id END) as opens,
           COUNT(DISTINCT CASE WHEN ee.type='click' THEN es.contact_id END) as clicks,
           COUNT(DISTINCT CASE WHEN ee.type='unsubscribe' THEN es.contact_id END) as unsubs
         FROM email_sends es
         LEFT JOIN email_events ee ON ee.send_id = es.id
         WHERE es.user_id = $1 AND es.sent_at >= $2`,
        [userId, since30d.toISOString()]
      );
      const s = statsRes.rows[0] ?? { sent: '0', opens: '0', clicks: '0', unsubs: '0' };
      const sent = parseInt(s.sent ?? '0', 10);

      return {
        stats30d: {
          sent,
          openRate: sent > 0 ? parseInt(s.opens ?? '0', 10) / sent : 0,
          clickRate: sent > 0 ? parseInt(s.clicks ?? '0', 10) / sent : 0,
          unsubRate: sent > 0 ? parseInt(s.unsubs ?? '0', 10) / sent : 0,
        },
      };
    });

    return reply.send(data);
  });
}
