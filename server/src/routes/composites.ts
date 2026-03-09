import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as db from '../db/index.js';
import { savePreview, getPreviewUrl } from '../lib/preview.js';

type AuthRequest = FastifyRequest & { userId: string };

interface CompositeBody {
  id: string;
  name: string;
  mode: 'native' | 'business';
  component: unknown;
  businessForm?: unknown;
  previewDataUrl?: string;
  status?: 'active' | 'deleted';
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
  isPublic?: boolean;
}

function toCompositeRow(body: CompositeBody, userId: string, isPublic: boolean): db.CompositeRow {
  let preview_url: string | null = null;
  if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
    preview_url = getPreviewUrl('composites', body.id);
  } else if (typeof body.previewDataUrl === 'string' && body.previewDataUrl.startsWith('/')) {
    preview_url = body.previewDataUrl;
  }
  return {
    id: body.id,
    user_id: userId,
    name: body.name,
    mode: body.mode,
    component: body.component,
    business_form: body.businessForm ?? null,
    preview_url,
    status: body.status ?? 'active',
    sort_order: body.sortOrder ?? 0,
    is_public: isPublic,
    created_at: body.createdAt,
    updated_at: body.updatedAt,
  };
}

export async function registerCompositesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/composites', async (req, reply) => {
    const rows = await db.listComposites();
    const list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      previewUrl: r.preview_url,
      status: r.status,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return reply.send(list);
  });

  app.get('/api/composites/mine', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const rows = await db.listCompositesByUserId(userId);
    const list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      previewUrl: r.preview_url,
      status: r.status,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return reply.send(list);
  });

  app.get<{ Params: { id: string } }>('/api/composites/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const row = await db.getComposite(req.params.id);
    if (!row) return reply.status(404).send({ error: '未找到該複合組件' });
    if (!row.is_public && row.user_id !== userId) {
      return reply.status(404).send({ error: '未找到該複合組件' });
    }
    return reply.send({
      id: row.id,
      name: row.name,
      mode: row.mode,
      component: row.component,
      businessForm: row.business_form,
      previewDataUrl: row.preview_url,
      status: row.status,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  app.post<{ Body: CompositeBody }>('/api/composites', async (req, reply) => {
    const body = req.body;
    const userId = (req as AuthRequest).userId;
    if (!body.id || !body.name || !body.mode || body.component == null) {
      return reply.status(400).send({ error: '缺少 id / name / mode / component' });
    }
    const isPublic = body.isPublic === true;
    if (isPublic) {
      const user = await db.getUserById(userId);
      if (!user?.is_admin) return reply.status(403).send({ error: '仅管理员可保存到公共组件库' });
    }
    const existing = await db.getComposite(body.id);
    if (existing) {
      if (existing.user_id !== userId) {
        return reply.status(403).send({ error: '该复合组件已存在且无权覆盖，请使用自己的组件 ID' });
      }
      return reply.status(409).send({ error: '复合组件已存在，请使用覆盖更新' });
    }
    const row = toCompositeRow(body, userId, isPublic);
    if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
      await savePreview('composites', body.id, body.previewDataUrl);
    }
    await db.putComposite(row);
    return reply.send({ ok: true, id: body.id, previewUrl: row.preview_url });
  });

  app.put<{ Params: { id: string }; Body: CompositeBody }>('/api/composites/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    if (req.params.id !== req.body.id) return reply.status(400).send({ error: 'id 不一致' });
    const body = req.body;
    if (!body.name || !body.mode || body.component == null) {
      return reply.status(400).send({ error: '缺少 name / mode / component' });
    }
    const existing = await db.getComposite(req.params.id);
    if (!existing) return reply.status(404).send({ error: '未找到該複合組件' });
    if (existing.user_id !== userId) return reply.status(403).send({ error: '僅創建者可編輯該複合組件' });
    const isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : existing.is_public;
    if (isPublic) {
      const user = await db.getUserById(userId);
      if (!user?.is_admin) return reply.status(403).send({ error: '仅管理员可保存到公共组件库' });
    }
    const row = toCompositeRow(body, existing.user_id, isPublic);
    if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
      await savePreview('composites', body.id, body.previewDataUrl);
    } else if (!row.preview_url && existing.preview_url) {
      row.preview_url = existing.preview_url;
    }
    await db.putComposite(row);
    return reply.send({ ok: true, previewUrl: row.preview_url });
  });

  app.delete<{ Params: { id: string } }>('/api/composites/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const ok = await db.softDeleteComposite(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '未找到該複合組件或僅創建者可刪除' });
    return reply.send({ ok: true });
  });
}
