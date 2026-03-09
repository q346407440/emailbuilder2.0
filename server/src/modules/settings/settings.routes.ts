/**
 * 設置路由（Iteration 7）
 */
import { promises as dns } from 'node:dns';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import * as db from '../../db/index.js';

type AuthRequest = FastifyRequest & { userId: string };
function getUserId(req: FastifyRequest): string { return (req as AuthRequest).userId; }

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/settings/brand ───────────────────────────────────────────────
  app.get('/api/settings/brand', async (req, reply) => {
    const userId = getUserId(req);
    const config = await db.getBrandConfig(userId);
    return reply.send(config);
  });

  // ── PUT /api/settings/brand ───────────────────────────────────────────────
  app.put<{ Body: Record<string, unknown> }>('/api/settings/brand', async (req, reply) => {
    const userId = getUserId(req);
    const body = req.body ?? {};
    const allowed = ['senderName', 'senderEmail', 'logoUrl', 'brandColor', 'footerText', 'unsubscribeText', 'shopName'];
    const config: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) config[key] = body[key];
    }
    const existing = await db.getBrandConfig(userId);
    await db.updateBrandConfig(userId, { ...existing, ...config });
    return reply.send({ ok: true });
  });

  // ── PUT /api/settings/account ─────────────────────────────────────────────
  app.put<{ Body: { displayName?: string } }>('/api/settings/account', async (req, reply) => {
    const userId = getUserId(req);
    const { displayName } = req.body ?? {};
    const updated = await db.updateUserProfile(userId, { display_name: displayName?.trim() ?? null });
    if (!updated) return reply.status(404).send({ error: '用戶不存在' });
    const user = await db.getUserById(userId);
    return reply.send({ ok: true, user: { id: user!.id, displayName: user!.display_name, email: user!.email } });
  });

  // ── POST /api/settings/account/password ───────────────────────────────────
  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/api/settings/account/password',
    async (req, reply) => {
      const userId = getUserId(req);
      const { currentPassword, newPassword } = req.body ?? {};
      if (!currentPassword || !newPassword) return reply.status(400).send({ error: '請提供當前密碼和新密碼' });
      if (newPassword.length < 6) return reply.status(400).send({ error: '新密碼至少 6 位' });
      const user = await db.getUserById(userId);
      if (!user) return reply.status(401).send({ error: '用戶不存在' });
      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) return reply.status(400).send({ error: '當前密碼錯誤' });
      const hash = await bcrypt.hash(newPassword, 10);
      await db.updateUserPassword(userId, hash);
      return reply.send({ ok: true });
    }
  );

  // ── POST /api/settings/sender/verify-dns ─────────────────────────────────
  app.post<{ Body: { domain: string } }>('/api/settings/sender/verify-dns', async (req, reply) => {
    const domain = req.body?.domain?.trim();
    if (!domain) return reply.status(400).send({ error: '請提供域名' });

    const result = { spf: false, dkim: false, domain };
    try {
      const txtRecords = await dns.resolveTxt(domain);
      const spfRecord = txtRecords.flat().find((r) => r.startsWith('v=spf1'));
      result.spf = !!spfRecord;
    } catch {
      // DNS lookup failed — mark as not verified
    }
    return reply.send({
      domain,
      spf: { status: result.spf ? 'verified' : 'not_found', record: `v=spf1 include:${domain} ~all` },
      dkim: { status: 'not_found', selector: 'mail', record: `mail._domainkey.${domain}` },
    });
  });

  // ── GET /api/variable-schema ──────────────────────────────────────────────
  app.get('/api/variable-schema', async (req, reply) => {
    const userId = getUserId(req);
    const rows = await db.listVariableSchema(userId);
    return reply.send(rows.map((r) => ({
      key: r.key, label: r.label, contentType: r.content_type,
      group: r.group_name, description: r.description,
      shoplazzaField: r.shoplazza_field, isCustom: r.is_custom,
    })));
  });

  // ── POST /api/variable-schema ─────────────────────────────────────────────
  app.post<{ Body: { key: string; label: string; contentType: string; description?: string } }>(
    '/api/variable-schema',
    async (req, reply) => {
      const userId = getUserId(req);
      const { key, label, contentType, description } = req.body ?? {};
      if (!key?.trim()) return reply.status(400).send({ error: '请填写变量 key' });
      if (!key.startsWith('custom.')) return reply.status(400).send({ error: 'key 必须以 custom. 开头' });
      if (!label?.trim()) return reply.status(400).send({ error: '请填写说明' });
      if (!['text', 'image', 'link'].includes(contentType ?? '')) return reply.status(400).send({ error: '类型无效' });
      await db.createCustomVariable({ key: key.trim(), label: label.trim(), content_type: contentType, group_name: 'custom', description, userId });
      return reply.status(201).send({ ok: true });
    }
  );

  // ── DELETE /api/variable-schema/:key ─────────────────────────────────────
  app.delete<{ Params: { key: string } }>('/api/variable-schema/:key', async (req, reply) => {
    const userId = getUserId(req);
    const ok = await db.deleteCustomVariable(decodeURIComponent(req.params.key), userId);
    if (!ok) return reply.status(404).send({ error: '找不到自定义变量或无法删除系统预置' });
    return reply.send({ ok: true });
  });
}
