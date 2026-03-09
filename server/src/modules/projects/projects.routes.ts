import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from '../../db/index.js';
import { savePreview, getPreviewUrl, copyPreviewFile, previewExists } from '../../lib/preview.js';

type AuthRequest = FastifyRequest & { userId: string };

const DEFAULT_EMPTY_CONFIG = {
  outerBackgroundColor: '#E8ECF1',
  backgroundType: 'color' as const,
  backgroundColor: '#FFFFFF',
  padding: { mode: 'unified' as const, unified: '0' },
  margin: { mode: 'unified' as const, unified: '0' },
  border: {
    mode: 'unified' as const,
    top: false,
    right: false,
    bottom: false,
    left: false,
    unified: '1px',
    color: '#E0E5EB',
    style: 'solid' as const,
  },
  borderRadius: { mode: 'unified' as const, unified: '0' },
  contentAlign: { horizontal: 'center' as const, vertical: 'top' as const },
  contentDistribution: 'packed' as const,
  contentGap: '16px',
  width: '600px',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

function getBaseUrl(req: FastifyRequest): string {
  return `${req.protocol}://${req.hostname}`;
}

export async function registerProjectsRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/projects/mine ─────────────────────────────────────────────────
  app.get('/api/projects/mine', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const rows = await db.listProjectsByUserId(userId);
    const baseUrl = getBaseUrl(req);
    return reply.send(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        desc: r.desc,
        previewUrl: r.preview_url
          ? r.preview_url.startsWith('http')
            ? r.preview_url
            : `${baseUrl}${r.preview_url}`
          : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  });

  // ── GET /api/projects/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const row = await db.getProject(req.params.id);
    if (!row) return reply.status(404).send({ error: '未找到该工程' });
    if (row.user_id !== userId) return reply.status(403).send({ error: '仅创建者可查看该工程' });
    return reply.send({
      id: row.id,
      title: row.title,
      desc: row.desc,
      components: row.components,
      config: row.config,
      customVariables: Array.isArray(row.custom_variables) ? row.custom_variables : [],
      renderingRules: (row.rendering_rules != null && typeof row.rendering_rules === 'object') ? row.rendering_rules : {},
      previewDataUrl: row.preview_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  // ── POST /api/projects ─────────────────────────────────────────────────────
  app.post<{ Body: { title?: string } }>('/api/projects', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 512) : '';
    const id = nanoid();
    const now = Date.now();
    const row: db.ProjectRow = {
      id,
      user_id: userId,
      title: title || '未命名工程',
      desc: null,
      components: [],
      config: DEFAULT_EMPTY_CONFIG,
      custom_variables: [],
      preview_url: null,
      created_at: now,
      updated_at: now,
    };
    await db.putProject(row);
    return reply.status(201).send({ id, title: row.title });
  });

  // ── PUT /api/projects/:id ──────────────────────────────────────────────────
  app.put<{
    Params: { id: string };
    Body: {
      title?: string;
      desc?: string;
      components?: unknown[];
      config?: unknown;
      customVariables?: unknown[];
      renderingRules?: unknown;
      updatedAt?: number;
    };
  }>('/api/projects/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const { id } = req.params;
    const body = req.body ?? {};
    const row = await db.getProject(id);
    if (!row) return reply.status(404).send({ error: '未找到该工程' });
    if (row.user_id !== userId) return reply.status(403).send({ error: '仅创建者可编辑该工程' });

    const updated: db.ProjectRow = {
      ...row,
      title: typeof body.title === 'string' ? body.title.trim().slice(0, 512) : row.title,
      desc: body.desc !== undefined ? (body.desc === null ? null : String(body.desc)) : row.desc,
      components: Array.isArray(body.components) ? body.components : row.components,
      config: body.config != null ? body.config : row.config,
      custom_variables: Array.isArray(body.customVariables)
        ? body.customVariables
        : (row.custom_variables as unknown[] ?? []),
      rendering_rules: (body.renderingRules != null && typeof body.renderingRules === 'object')
        ? body.renderingRules
        : (row.rendering_rules ?? {}),
      updated_at: typeof body.updatedAt === 'number' ? body.updatedAt : Date.now(),
    };
    await db.putProject(updated);
    return reply.send({
      ok: true,
      previewUrl: updated.preview_url,
    });
  });

  // ── PUT /api/projects/:id/preview ───────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { previewDataUrl: string } }>(
    '/api/projects/:id/preview',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { id } = req.params;
      const { previewDataUrl } = req.body ?? {};
      if (!previewDataUrl || !String(previewDataUrl).startsWith('data:')) {
        return reply.status(400).send({ error: '缺少有效的 previewDataUrl（需为 data: 开头）' });
      }
      const row = await db.getProject(id);
      if (!row) return reply.status(404).send({ error: '未找到该工程' });
      if (row.user_id !== userId) return reply.status(403).send({ error: '仅创建者可更新该工程预览' });
      await savePreview('projects', id, previewDataUrl);
      const previewUrl = getPreviewUrl('projects', id);
      await db.putProject({ ...row, preview_url: previewUrl });
      return reply.send({ ok: true, previewUrl });
    }
  );

  // ── DELETE /api/projects/:id ───────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const ok = await db.deleteProject(req.params.id, userId);
    if (!ok) return reply.status(404).send({ error: '未找到该工程或仅创建者可删除' });
    return reply.send({ ok: true });
  });

  // ── POST /api/projects/:id/publish ─────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: {
      mode: 'new' | 'overwrite';
      title?: string;
      desc?: string;
      setAsDefault?: boolean;
      isPublic?: boolean;
      selectedTemplateId?: string;
      deleteProjectAfter?: boolean;
    };
  }>('/api/projects/:id/publish', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const projectId = req.params.id;
    const body = req.body ?? {};
    const project = await db.getProject(projectId);
    if (!project) return reply.status(404).send({ error: '未找到该工程' });
    if (project.user_id !== userId) return reply.status(403).send({ error: '仅创建者可发布该工程' });

    const now = Date.now();
    let templateId: string;
    const customVariables = Array.isArray(project.custom_variables) ? project.custom_variables : [];
    const renderingRules = (project.rendering_rules != null && typeof project.rendering_rules === 'object') ? project.rendering_rules : {};
    const requiredVariableKeys: unknown[] = [];

    if (body.mode === 'overwrite' && body.selectedTemplateId) {
      const existing = await db.getTemplate(body.selectedTemplateId);
      if (!existing) return reply.status(404).send({ error: '未找到要覆盖的模板' });
      if (existing.user_id !== userId) return reply.status(403).send({ error: '仅可覆盖自己创建的模板' });
      if (existing.deleted_at) return reply.status(404).send({ error: '模板已删除' });
      const isPublic = body.isPublic === true;
      if (isPublic) {
        const user = await db.getUserById(userId);
        if (!user?.is_admin) return reply.status(403).send({ error: '仅管理员可保存到公共模板' });
      }
      templateId = existing.id;
      const templateRow: db.TemplateRow = {
        id: existing.id,
        user_id: userId,
        title: existing.title,
        desc: existing.desc,
        components: project.components,
        config: project.config,
        preview_url: existing.preview_url,
        is_public: isPublic,
        created_at: existing.created_at,
        updated_at: now,
        required_variable_keys: (existing.required_variable_keys ?? []) as unknown[],
        custom_variables: customVariables,
        rendering_rules: renderingRules,
      };
      if (previewExists('projects', projectId)) {
        copyPreviewFile('projects', projectId, 'templates', templateId);
        templateRow.preview_url = `/api/previews/templates/${templateId}`;
      }
      await db.putTemplate(templateRow);
    } else {
      const title =
        body.mode === 'new' && typeof body.title === 'string'
          ? body.title.trim().slice(0, 512)
          : project.title || '未命名模板';
      if (!title) return reply.status(400).send({ error: '发布为新模板时 title 不能为空' });
      const isPublic = body.isPublic === true;
      if (isPublic) {
        const user = await db.getUserById(userId);
        if (!user?.is_admin) return reply.status(403).send({ error: '仅管理员可保存到公共模板' });
      }
      templateId = nanoid();
      const templateRow: db.TemplateRow = {
        id: templateId,
        user_id: userId,
        title,
        desc: body.desc ?? project.desc ?? '',
        components: project.components,
        config: project.config,
        preview_url: null,
        is_public: isPublic,
        created_at: now,
        updated_at: now,
        required_variable_keys: requiredVariableKeys,
        custom_variables: customVariables,
        rendering_rules: renderingRules,
      };
      if (previewExists('projects', projectId)) {
        copyPreviewFile('projects', projectId, 'templates', templateId);
        templateRow.preview_url = `/api/previews/templates/${templateId}`;
      }
      await db.putTemplate(templateRow);
    }

    if (body.deleteProjectAfter === true) {
      await db.deleteProject(projectId, userId);
    }

    return reply.send({ templateId, setAsDefault: body.setAsDefault === true });
  });
}
