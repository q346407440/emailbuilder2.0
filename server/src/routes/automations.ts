/**
 * 自动化流程路由（Iteration 5）
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from '../db/index.js';
import { withCache } from '../lib/analyticsCache.js';

type AuthRequest = FastifyRequest & { userId: string };
function getUserId(req: FastifyRequest): string { return (req as AuthRequest).userId; }

// ─── Preset Templates ─────────────────────────────────────────────────────────

interface AutomationStep {
  id: string;
  type: 'wait' | 'condition' | 'send_email' | 'end';
  config: Record<string, unknown>;
  exitIfTrue?: boolean;
}

interface AutomationPreset {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  icon: string;
  steps: AutomationStep[];
}

const PRESETS: AutomationPreset[] = [
  {
    id: 'abandoned_cart',
    name: '弃单提醒（3 步）',
    description: '顾客加入购物车后未付款，1 小时后发送提醒；24 小时后再发一次。',
    triggerType: 'abandoned_cart',
    triggerConfig: {},
    icon: '🛒',
    steps: [
      { id: nanoid(), type: 'wait', config: { amount: 1, unit: 'hour' } },
      { id: nanoid(), type: 'condition', config: { check: 'order_paid' }, exitIfTrue: true },
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '您的购物车还在等您！' } },
      { id: nanoid(), type: 'wait', config: { amount: 23, unit: 'hour' } },
      { id: nanoid(), type: 'condition', config: { check: 'order_paid' }, exitIfTrue: true },
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '最后机会！您的购物车即将过期' } },
    ],
  },
  {
    id: 'welcome_series',
    name: '欢迎新用户序列',
    description: '顾客注册后立即发送欢迎邮件，2 天后发送品牌介绍。',
    triggerType: 'customer_created',
    triggerConfig: {},
    icon: '👋',
    steps: [
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '欢迎加入！' } },
      { id: nanoid(), type: 'wait', config: { amount: 2, unit: 'day' } },
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '了解我们的品牌故事' } },
    ],
  },
  {
    id: 'order_confirmation',
    name: '订单确认',
    description: '顾客付款后立即发送订单确认邮件。',
    triggerType: 'order_paid',
    triggerConfig: {},
    icon: '✅',
    steps: [
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '您的订单已确认！' } },
    ],
  },
  {
    id: 'shipping_notification',
    name: '发货通知',
    description: '订单发货后立即通知顾客，附物流追踪信息。',
    triggerType: 'order_fulfilled',
    triggerConfig: {},
    icon: '📦',
    steps: [
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '您的订单已发出！' } },
    ],
  },
  {
    id: 'post_purchase',
    name: '购后跟进',
    description: '订单付款 7 天后，邀请顾客评价并推荐相关商品。',
    triggerType: 'order_paid',
    triggerConfig: {},
    icon: '⭐',
    steps: [
      { id: nanoid(), type: 'wait', config: { amount: 7, unit: 'day' } },
      { id: nanoid(), type: 'send_email', config: { templateId: null, subject: '您对我们的商品满意吗？' } },
    ],
  },
];

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerAutomationsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/automations ──────────────────────────────────────────────────
  app.get('/api/automations', async (req, reply) => {
    const userId = getUserId(req);
    const rows = await db.listAutomations(userId);
    const enriched = await Promise.all(rows.map(async (a) => {
      const stats = await db.getAutomationStats(a.id);
      const steps = Array.isArray(a.steps) ? a.steps : [];
      return {
        id: a.id, name: a.name, triggerType: a.trigger_type, status: a.status,
        stepCount: steps.length, ...stats,
        createdAt: a.created_at, updatedAt: a.updated_at,
      };
    }));
    return reply.send(enriched);
  });

  // ── GET /api/automations/presets ──────────────────────────────────────────
  // Must be before /:id
  app.get('/api/automations/presets', async (_req, reply) => {
    return reply.send(PRESETS.map((p) => ({
      id: p.id, name: p.name, description: p.description,
      triggerType: p.triggerType, icon: p.icon, stepCount: p.steps.length,
    })));
  });

  // ── POST /api/automations/from-preset/:presetId ───────────────────────────
  app.post<{ Params: { presetId: string } }>(
    '/api/automations/from-preset/:presetId',
    async (req, reply) => {
      const userId = getUserId(req);
      const preset = PRESETS.find((p) => p.id === req.params.presetId);
      if (!preset) return reply.status(404).send({ error: '預設模板不存在' });
      // Re-generate step IDs to avoid conflicts
      const steps = preset.steps.map((s) => ({ ...s, id: nanoid() }));
      const automation = await db.createAutomation(userId, {
        name: preset.name,
        triggerType: preset.triggerType,
        steps,
      });
      return reply.status(201).send({ id: automation.id });
    }
  );

  // ── POST /api/automations ─────────────────────────────────────────────────
  app.post<{ Body: { name: string; triggerType: string; steps?: unknown[] } }>(
    '/api/automations',
    async (req, reply) => {
      const userId = getUserId(req);
      const { name, triggerType, steps } = req.body ?? {};
      if (!name?.trim()) return reply.status(400).send({ error: '請填寫流程名稱' });
      if (!triggerType?.trim()) return reply.status(400).send({ error: '請選擇觸發器' });
      const automation = await db.createAutomation(userId, { name, triggerType, steps });
      return reply.status(201).send({ id: automation.id });
    }
  );

  // ── GET /api/automations/:id ──────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/automations/:id', async (req, reply) => {
    const userId = getUserId(req);
    const a = await db.getAutomationById(req.params.id, userId);
    if (!a) return reply.status(404).send({ error: '自動化流程不存在' });
    const stats = await db.getAutomationStats(a.id);
    return reply.send({ ...a, ...stats });
  });

  // ── PUT /api/automations/:id ──────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/automations/:id',
    async (req, reply) => {
      const userId = getUserId(req);
      const body = req.body ?? {};
      const ok = await db.updateAutomation(req.params.id, userId, {
        name: body.name as string | undefined,
        steps: body.steps as unknown[] | undefined,
        triggerType: body.triggerType as string | undefined,
        triggerConfig: body.triggerConfig,
        status: body.status as string | undefined,
      });
      if (!ok) return reply.status(404).send({ error: '自動化流程不存在' });
      return reply.send({ ok: true });
    }
  );

  // ── POST /api/automations/:id/activate ───────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/automations/:id/activate', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.updateAutomation(req.params.id, userId, { status: 'active' });
    if (!ok) return reply.status(404).send({ error: '自動化流程不存在' });
    return reply.send({ ok: true, status: 'active' });
  });

  // ── POST /api/automations/:id/pause ──────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/automations/:id/pause', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.updateAutomation(req.params.id, userId, { status: 'paused' });
    if (!ok) return reply.status(404).send({ error: '自動化流程不存在' });
    return reply.send({ ok: true, status: 'paused' });
  });

  // ── DELETE /api/automations/:id ───────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/automations/:id', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.softDeleteAutomation(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '自動化流程不存在' });
    return reply.send({ ok: true });
  });

  // ── GET /api/automations/:id/enrollments ──────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/automations/:id/enrollments', async (req, reply) => {
    const userId = getUserId(req);
    const a = await db.getAutomationById(req.params.id, userId);
    if (!a) return reply.status(404).send({ error: '自動化流程不存在' });
    const enrollments = await db.listRecentEnrollments(req.params.id);
    // Enrich with contact email
    const enriched = await Promise.all(enrollments.map(async (e) => {
      const contact = await db.getContactById(e.contact_id, e.user_id);
      return {
        id: e.id, contactId: e.contact_id, contactEmail: contact?.email ?? '—',
        contactName: contact?.name,
        currentStep: e.current_step, status: e.status,
        enrolledAt: e.enrolled_at, nextRunAt: e.next_run_at,
      };
    }));
    return reply.send(enriched);
  });

  // ── GET /api/automations/:id/stats ───────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/automations/:id/stats', async (req, reply) => {
    const userId = getUserId(req);
    const a = await db.getAutomationById(req.params.id, userId);
    if (!a) return reply.status(404).send({ error: '自動化流程不存在' });
    const stats = await withCache(`automation:stats:${req.params.id}`, 300, () => db.getAutomationStats(req.params.id));
    return reply.send(stats);
  });

  // ── GET /api/automations/:id/step-stats (Iteration 6) ────────────────────
  app.get<{ Params: { id: string } }>('/api/automations/:id/step-stats', async (req, reply) => {
    const userId = getUserId(req);
    const a = await db.getAutomationById(req.params.id, userId);
    if (!a) return reply.status(404).send({ error: '自動化流程不存在' });

    const stepStats = await withCache(`automation:step-stats:${req.params.id}`, 300, async () => {
      const steps = Array.isArray(a.steps) ? (a.steps as Record<string, unknown>[]) : [];

      // Get total enrollments and exits per step index
      const enrollRes = await db.queryDb<{ step: string; status: string; cnt: string }>(
        `SELECT current_step as step, status, COUNT(*) as cnt
         FROM automation_enrollments WHERE automation_id = $1 GROUP BY current_step, status`,
        [req.params.id]
      );
      const stepCounts = new Map<number, { active: number; exited: number; completed: number }>();
      for (const r of enrollRes.rows) {
        const step = parseInt(r.step, 10);
        if (!stepCounts.has(step)) stepCounts.set(step, { active: 0, exited: 0, completed: 0 });
        const e = stepCounts.get(step)!;
        if (r.status === 'active') e.active += parseInt(r.cnt, 10);
        else if (r.status === 'exited') e.exited += parseInt(r.cnt, 10);
        else if (r.status === 'completed') e.completed += parseInt(r.cnt, 10);
      }

      // Get email sends per enrollment (tied to automation)
      const emailRes = await db.queryDb<{ enrollment_id: string; opens: string; clicks: string }>(
        `SELECT es.automation_enrollment_id as enrollment_id,
                COUNT(DISTINCT CASE WHEN ee.type='open' THEN ee.id END) as opens,
                COUNT(DISTINCT CASE WHEN ee.type='click' THEN ee.id END) as clicks
         FROM email_sends es
         LEFT JOIN email_events ee ON ee.send_id = es.id
         WHERE es.automation_id = $1
         GROUP BY es.automation_enrollment_id`,
        [req.params.id]
      );

      const totalSent = emailRes.rows.length;
      const totalOpens = emailRes.rows.reduce((s, r) => s + parseInt(r.opens ?? '0', 10), 0);
      const totalClicks = emailRes.rows.reduce((s, r) => s + parseInt(r.clicks ?? '0', 10), 0);

      return steps.map((step, index) => ({
        stepIndex: index,
        stepId: String(step.id ?? ''),
        stepType: String(step.type ?? ''),
        stepConfig: step.config ?? {},
        counts: stepCounts.get(index) ?? { active: 0, exited: 0, completed: 0 },
        // For send_email steps: global stats
        sent: step.type === 'send_email' ? totalSent : undefined,
        opens: step.type === 'send_email' ? totalOpens : undefined,
        clicks: step.type === 'send_email' ? totalClicks : undefined,
        openRate: step.type === 'send_email' && totalSent > 0 ? totalOpens / totalSent : undefined,
        clickRate: step.type === 'send_email' && totalSent > 0 ? totalClicks / totalSent : undefined,
      }));
    });

    return reply.send(stepStats);
  });
}
