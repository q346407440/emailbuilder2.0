import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from '../db/index.js';
import { savePreview, getPreviewUrl } from '../lib/preview.js';
import { applyPatchAtPath, type TreeNode } from '../utils/applyPatchAtPath.js';

type AuthRequest = FastifyRequest & { userId: string };

// ─── Shared types ────────────────────────────────────────────────────────────

/** Legacy full-body template save (used by existing editor SaveTemplateModal) */
interface TemplateBody {
  id: string;
  title: string;
  desc?: string;
  components: unknown[];
  config: unknown;
  previewDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  isPublic?: boolean;
  /** Variable keys attached to content slots (Iteration 1+) */
  requiredVariableKeys?: string[];
  /** Template-level custom variable definitions (Iteration 2+) */
  customVariables?: unknown[];
  /** Layer 4：渲染規則（動態邏輯字段，從組件樹中獨立出來） */
  renderingRules?: unknown;
}

function toTemplateRow(body: TemplateBody, userId: string, isPublic: boolean): db.TemplateRow {
  let preview_url: string | null = null;
  if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
    preview_url = getPreviewUrl('templates', body.id);
  }
  return {
    id: body.id,
    user_id: userId,
    title: body.title,
    desc: body.desc ?? '',
    components: body.components,
    config: body.config,
    preview_url,
    is_public: isPublic,
    created_at: body.createdAt,
    updated_at: body.updatedAt,
    required_variable_keys: Array.isArray(body.requiredVariableKeys) ? body.requiredVariableKeys : [],
    custom_variables: Array.isArray(body.customVariables) ? body.customVariables : [],
    rendering_rules: body.renderingRules != null && typeof body.renderingRules === 'object' ? body.renderingRules : {},
  };
}

function toListItem(r: db.TemplateRow, baseUrl: string) {
  return {
    id: r.id,
    title: r.title,
    desc: r.desc,
    previewUrl: r.preview_url ? (r.preview_url.startsWith('http') ? r.preview_url : `${baseUrl}${r.preview_url}`) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isPublic: r.is_public,
    requiredVariableKeys: Array.isArray(r.required_variable_keys)
      ? r.required_variable_keys
      : (r.required_variable_keys as unknown as unknown[] ?? []),
  };
}

function getBaseUrl(req: FastifyRequest): string {
  return `${req.protocol}://${req.hostname}`;
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerTemplatesRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/templates ──────────────────────────────────────────────────────
  // Returns public templates list.
  // Supports optional pagination via ?page=&pageSize= (new in Iter-1)
  app.get<{ Querystring: { page?: string; pageSize?: string } }>('/api/templates', async (req, reply) => {
    const page = parseInt(req.query.page ?? '0', 10);
    const pageSize = parseInt(req.query.pageSize ?? '0', 10);

    if (page > 0 && pageSize > 0) {
      const userId = (req as AuthRequest).userId ?? '';
      const { rows, total } = await db.listTemplatesPaginated({ userId, tab: 'public', page, pageSize });
      return reply.send({
        data: rows.map((r) => toListItem(r, getBaseUrl(req))),
        total,
        page,
        pageSize,
      });
    }

    // Legacy: return full flat list (existing editor store depends on this)
    const rows = await db.listTemplates();
    return reply.send(rows.map((r) => ({
      id: r.id,
      title: r.title,
      desc: r.desc,
      previewUrl: r.preview_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      requiredVariableKeys: Array.isArray(r.required_variable_keys) ? r.required_variable_keys : [],
    })));
  });

  // ── GET /api/templates/mine ─────────────────────────────────────────────────
  app.get<{ Querystring: { page?: string; pageSize?: string } }>('/api/templates/mine', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const page = parseInt(req.query.page ?? '0', 10);
    const pageSize = parseInt(req.query.pageSize ?? '0', 10);

    if (page > 0 && pageSize > 0) {
      const { rows, total } = await db.listTemplatesPaginated({ userId, tab: 'mine', page, pageSize });
      return reply.send({
        data: rows.map((r) => toListItem(r, getBaseUrl(req))),
        total,
        page,
        pageSize,
      });
    }

    const rows = await db.listTemplatesByUserId(userId);
    return reply.send(rows.map((r) => ({
      id: r.id,
      title: r.title,
      desc: r.desc,
      previewUrl: r.preview_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      requiredVariableKeys: Array.isArray(r.required_variable_keys) ? r.required_variable_keys : [],
    })));
  });

  // ── GET /api/templates/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/templates/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const row = await db.getTemplate(req.params.id);
    if (!row) return reply.status(404).send({ error: '未找到該模板' });
    if (!row.is_public && row.user_id !== userId) {
      return reply.status(404).send({ error: '未找到該模板' });
    }
    if (row.deleted_at) {
      return reply.status(404).send({ error: '模板已刪除' });
    }
    return reply.send({
      id: row.id,
      title: row.title,
      desc: row.desc,
      components: row.components,
      config: row.config,
      previewDataUrl: row.preview_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isPublic: row.is_public,
      requiredVariableKeys: Array.isArray(row.required_variable_keys)
        ? row.required_variable_keys
        : [],
      customVariables: Array.isArray(row.custom_variables) ? row.custom_variables : [],
      renderingRules: (row.rendering_rules != null && typeof row.rendering_rules === 'object') ? row.rendering_rules : {},
    });
  });

  // ── POST /api/templates ─────────────────────────────────────────────────────
  // Handles TWO cases:
  // Case A (new in Iter-1): body = { name } → create empty template, return { id, name }
  // Case B (existing):      body = { id, title, components, config, ... } → full save
  app.post<{ Body: TemplateBody & { name?: string } }>('/api/templates', async (req, reply) => {
    const body = req.body;
    const userId = (req as AuthRequest).userId;

    // ── Case A: Create empty template ──────────────────────────────────────
    if (!body.components && body.name) {
      const name = String(body.name).trim().slice(0, 100);
      if (!name) return reply.status(400).send({ error: '模板名稱不能為空' });
      const id = nanoid();
      const now = Date.now();
      const row: db.TemplateRow = {
        id,
        user_id: userId,
        title: name,
        desc: '',
        components: [],
        config: {
          outerBackgroundColor: '#E8ECF1',
          backgroundType: 'color',
          backgroundColor: '#FFFFFF',
          padding: { mode: 'unified', unified: '0' },
          margin: { mode: 'unified', unified: '0' },
          border: { mode: 'unified', top: false, right: false, bottom: false, left: false, unified: '1px', color: '#E0E5EB', style: 'solid' },
          borderRadius: { mode: 'unified', unified: '0' },
          contentAlign: { horizontal: 'center', vertical: 'top' },
          contentDistribution: 'packed',
          contentGap: '16px',
          width: '600px',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        },
        preview_url: null,
        is_public: false,
        created_at: now,
        updated_at: now,
        required_variable_keys: [],
      };
      await db.putTemplate(row);
      return reply.status(201).send({ id, name });
    }

    // ── Case B: Full save (existing editor flow) ────────────────────────────
    if (!body.id || !body.title || !Array.isArray(body.components) || body.config == null) {
      return reply.status(400).send({ error: '缺少 id / title / components / config' });
    }
    const isPublic = body.isPublic === true;
    if (isPublic) {
      const user = await db.getUserById(userId);
      if (!user?.is_admin) return reply.status(403).send({ error: '仅管理员可保存到公共模板' });
    }
    const existing = await db.getTemplate(body.id);
    if (existing) {
      if (existing.user_id !== userId) {
        return reply.status(403).send({ error: '该模板已存在且无权覆盖，请使用自己的模板 ID' });
      }
      return reply.status(409).send({ error: '模板已存在，请使用覆盖更新' });
    }
    const row = toTemplateRow(body, userId, isPublic);
    if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
      await savePreview('templates', body.id, body.previewDataUrl);
    }
    await db.putTemplate(row);
    return reply.send({ ok: true, id: body.id, previewUrl: row.preview_url });
  });

  // ── PUT /api/templates/:id ──────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: TemplateBody }>('/api/templates/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const body = req.body;

    // Allow partial update (just name/config/components without id in body)
    const templateId = req.params.id;

    if (!body.title || !Array.isArray(body.components) || body.config == null) {
      return reply.status(400).send({ error: '缺少 title / components / config' });
    }
    if (body.id && body.id !== templateId) {
      return reply.status(400).send({ error: 'id 不一致' });
    }
    const existing = await db.getTemplate(templateId);
    if (!existing) return reply.status(404).send({ error: '未找到該模板' });
    if (existing.user_id !== userId) return reply.status(403).send({ error: '僅創建者可編輯該模板' });
    if (existing.deleted_at) return reply.status(404).send({ error: '模板已刪除' });

    const isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : existing.is_public;
    if (isPublic) {
      const user = await db.getUserById(userId);
      if (!user?.is_admin) return reply.status(403).send({ error: '仅管理员可保存到公共模板' });
    }

    const row = toTemplateRow({ ...body, id: templateId }, existing.user_id, isPublic);
    if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
      await savePreview('templates', templateId, body.previewDataUrl);
    } else if (!row.preview_url && existing.preview_url) {
      row.preview_url = existing.preview_url;
    }
    await db.putTemplate(row);
    return reply.send({
      ok: true,
      previewUrl: row.preview_url,
      requiredVariableKeys: Array.isArray(row.required_variable_keys) ? row.required_variable_keys : [],
    });
  });

  // ── DELETE /api/templates/:id — SOFT DELETE ─────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/templates/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const ok = await db.deleteTemplate(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '未找到該模板或僅創建者可刪除' });
    return reply.send({ ok: true });
  });

  // ── POST /api/templates/:id/duplicate ───────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/templates/:id/duplicate', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const source = await db.getTemplate(req.params.id);
    if (!source) return reply.status(404).send({ error: '未找到該模板' });
    if (!source.is_public && source.user_id !== userId) {
      return reply.status(403).send({ error: '無法複製此模板' });
    }
    const newId = nanoid();
    const now = Date.now();
    const newRow: db.TemplateRow = {
      ...source,
      id: newId,
      user_id: userId,
      title: `${source.title}（副本）`,
      is_public: false,
      preview_url: null,
      created_at: now,
      updated_at: now,
      required_variable_keys: source.required_variable_keys ?? [],
    };
    await db.putTemplate(newRow);
    return reply.status(201).send({ id: newId, title: newRow.title });
  });

  // ── POST /api/templates/:id/update-component ────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { path: number[]; patch: { props?: Record<string, unknown>; wrapperStyle?: Record<string, unknown> } };
  }>('/api/templates/:id/update-component', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const { id } = req.params;
    const { path: pathArr, patch } = req.body;
    if (!Array.isArray(pathArr) || !patch) {
      return reply.status(400).send({ error: '缺少 path 或 patch' });
    }
    const row = await db.getTemplate(id);
    if (!row) return reply.status(404).send({ error: '未找到該模板' });
    if (row.user_id !== userId) return reply.status(403).send({ error: '僅創建者可編輯該模板' });
    const components = row.components as TreeNode[];
    const nextComponents = applyPatchAtPath(components, pathArr, patch);
    await db.putTemplate({ ...row, components: nextComponents, updated_at: Date.now() });
    return reply.send({ ok: true });
  });

  // ── POST /api/templates/:id/preview-html (Iteration 7) ───────────────────
  app.post<{
    Params: { id: string };
    Body: { sampleData?: Record<string, string> };
  }>('/api/templates/:id/preview-html', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const row = await db.getTemplate(req.params.id);
    if (!row) return reply.status(404).send({ error: '未找到模板' });
    if (!row.is_public && row.user_id !== userId) return reply.status(403).send({ error: '無權訪問' });

    const sampleData = req.body?.sampleData ?? {};
    const components = Array.isArray(row.components) ? row.components : [];
    const CONTENT_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
    const PRODUCT_VAR_TO_SNAPSHOT_KEY: Record<string, string> = {
      'product.imageUrl': 'imageUrl',
      'product.title': 'title',
      'product.price': 'price',
      'product.compareAtPrice': 'compareAtPrice',
      'product.url': 'url',
    };

    const getBoundValue = (node: Record<string, unknown>, variableKey: string): string => {
      const previewSource = node.variablePreviewSource;
      if (
        variableKey.startsWith('product.') &&
        previewSource &&
        typeof previewSource === 'object' &&
        (previewSource as Record<string, unknown>).type === 'product'
      ) {
        const snapshot = (previewSource as Record<string, unknown>).snapshot;
        if (snapshot && typeof snapshot === 'object') {
          const snapshotKey = PRODUCT_VAR_TO_SNAPSHOT_KEY[variableKey];
          if (snapshotKey) {
            const value = (snapshot as Record<string, unknown>)[snapshotKey];
            if (typeof value === 'string' && value) return value;
          }
        }
      }
      return sampleData[variableKey] ?? '';
    };

    // Traverse component tree to extract and render HTML
    const htmlParts: string[] = [];
    function traverse(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const type = String(obj.type ?? '');
      const props = (obj.props ?? {}) as Record<string, unknown>;

      const variableBindings =
        obj.variableBindings && typeof obj.variableBindings === 'object'
          ? (obj.variableBindings as Record<string, string>)
          : {};

      if (type === 'text' || type === 'button') {
        const propPath = type === 'text' ? 'props.content' : 'props.text';
        const boundVariableKey = variableBindings[propPath];
        const rawContent = String(type === 'text' ? (props.content ?? '') : (props.text ?? ''));
        const renderedByBinding = boundVariableKey ? getBoundValue(obj, boundVariableKey) : '';
        const rendered = (renderedByBinding || rawContent).replace(CONTENT_PLACEHOLDER_REGEX, (_, key: string) => {
          const k = key?.trim();
          if (!k) return '{{}}';
          const v = getBoundValue(obj, k);
          return v || `{{${k}}}`;
        });
        if (rendered) {
          htmlParts.push(`<div style="padding:8px;font-family:Arial,sans-serif">${rendered}</div>`);
        }
      } else if (type === 'image') {
        const src = String(props.src ?? '');
        const srcVariableKey = variableBindings['props.src'];
        const imgSrc = srcVariableKey ? (getBoundValue(obj, srcVariableKey) || src) : src;
        if (imgSrc) {
          htmlParts.push(`<div style="padding:8px"><img src="${imgSrc}" style="max-width:100%;height:auto" /></div>`);
        }
      }
      // Recurse children
      if (Array.isArray(obj.children)) obj.children.forEach(traverse);
    }
    components.forEach(traverse);

    // Build full email HTML
    const configObj = (row.config ?? {}) as Record<string, unknown>;
    const bgColor = String(configObj.outerBackgroundColor ?? '#f5f7fa');
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { margin:0; padding:0; background:${bgColor}; font-family:Arial,sans-serif; }
  .container { max-width:600px; margin:0 auto; background:#fff; }
</style>
</head>
<body>
<div class="container">
  <div style="padding:16px">
    <h2 style="font-family:Arial,sans-serif;color:#1976D2;margin:0 0 12px">${row.title}</h2>
    ${htmlParts.join('\n') || '<p style="color:#aaa;padding:8px">此模板暫無可預覽的內容組件</p>'}
  </div>
  <div style="padding:12px 16px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#aaa;text-align:center">
    ${Object.entries(sampleData).map(([k, v]) => `<code>${k}: ${v}</code>`).join(' · ')}
  </div>
</div>
</body></html>`;

    return reply.send({ html });
  });
}
