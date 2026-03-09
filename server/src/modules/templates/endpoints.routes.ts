import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import * as db from '../../db/index.js';
import { renderTemplate, getShoplazzaPreviewData } from '../../lib/renderTemplate.js';
import { sendViaGmail } from '../../lib/gmailSend.js';

type AuthRequest = FastifyRequest & { userId: string };

/**
 * 将外部数据按 field_mapping 转换为模板变量数据
 * field_mapping: { templateVarKey -> externalFieldPath }
 * 支持路径如 "customer.name"、"data[].title"（数组子字段）
 */
function applyFieldMapping(
  externalData: Record<string, unknown>,
  fieldMapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [templateKey, externalPath] of Object.entries(fieldMapping)) {
    if (!externalPath) continue;

    // 数组子字段：路径含 "[]." 表示取数组并映射子字段
    // 例：templateKey="item.title", externalPath="data[].title"
    // 这类映射在 render 时通过 loopBinding 处理，跳过单值提取
    if (externalPath.includes('[].')) continue;

    const value = getNestedValue(externalData, externalPath);
    if (value !== undefined) {
      result[templateKey] = value;
    }
  }

  // 处理数组变量：找出所有 "arrayKey[].subKey" 形式的映射，组装数组
  const arrayMappings: Record<string, Record<string, string>> = {};
  for (const [templateKey, externalPath] of Object.entries(fieldMapping)) {
    if (!externalPath.includes('[].')) continue;
    const bracketIdx = externalPath.indexOf('[].');
    const arrayPath = externalPath.slice(0, bracketIdx);
    const subKey = externalPath.slice(bracketIdx + 3);
    // templateKey 形如 "item.title" -> 取 "title" 作为 itemField
    const itemField = templateKey.includes('.') ? templateKey.split('.').slice(1).join('.') : templateKey;
    if (!arrayMappings[arrayPath]) arrayMappings[arrayPath] = {};
    arrayMappings[arrayPath][itemField] = subKey;
  }

  for (const [arrayPath, subFieldMap] of Object.entries(arrayMappings)) {
    const arr = getNestedValue(externalData, arrayPath);
    if (!Array.isArray(arr)) continue;
    // 找到对应的模板数组变量 key（templateKey 前缀，如 "products"）
    const templateArrayKey = Object.entries(fieldMapping)
      .find(([, ep]) => ep === arrayPath)?.[0];
    const outKey = templateArrayKey ?? arrayPath;
    result[outKey] = arr.map((item) => {
      const mapped: Record<string, unknown> = {};
      for (const [itemField, srcField] of Object.entries(subFieldMap)) {
        const v = getNestedValue(item as Record<string, unknown>, srcField);
        if (v !== undefined) mapped[itemField] = v;
      }
      return mapped;
    });
  }

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function toEndpointDto(row: db.TemplateEndpointRow) {
  return {
    id: row.id,
    templateId: row.template_id,
    name: row.name,
    sourceSchema: row.source_schema,
    fieldMapping: row.field_mapping,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function registerEndpointsRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/templates/:templateId/endpoints ────────────────────────────────
  app.get<{ Params: { templateId: string } }>(
    '/api/templates/:templateId/endpoints',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { templateId } = req.params;
      const rows = await db.listEndpointsByTemplateId(templateId, userId);
      return reply.send(rows.map(toEndpointDto));
    }
  );

  // ── POST /api/templates/:templateId/endpoints ───────────────────────────────
  app.post<{
    Params: { templateId: string };
    Body: { name: string; sourceSchema?: unknown[]; fieldMapping?: Record<string, string> };
  }>(
    '/api/templates/:templateId/endpoints',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { templateId } = req.params;
      const { name, sourceSchema = [], fieldMapping = {} } = req.body;
      if (!name?.trim()) return reply.status(400).send({ error: '接入点名称不能为空' });

      const now = Date.now();
      const row: db.TemplateEndpointRow = {
        id: nanoid(),
        template_id: templateId,
        user_id: userId,
        name: name.trim(),
        source_schema: sourceSchema,
        field_mapping: fieldMapping,
        created_at: now,
        updated_at: now,
      };
      await db.createEndpoint(row);
      return reply.status(201).send(toEndpointDto(row));
    }
  );

  // ── PUT /api/templates/:templateId/endpoints/:endpointId ───────────────────
  app.put<{
    Params: { templateId: string; endpointId: string };
    Body: { name?: string; sourceSchema?: unknown[]; fieldMapping?: Record<string, string> };
  }>(
    '/api/templates/:templateId/endpoints/:endpointId',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { endpointId } = req.params;
      const { name, sourceSchema, fieldMapping } = req.body;
      const updated = await db.updateEndpoint(endpointId, userId, {
        name,
        source_schema: sourceSchema,
        field_mapping: fieldMapping,
      });
      if (!updated) return reply.status(404).send({ error: '接入点不存在或无权限' });
      const row = await db.getEndpoint(endpointId, userId);
      return reply.send(toEndpointDto(row!));
    }
  );

  // ── DELETE /api/templates/:templateId/endpoints/:endpointId ───────────────
  app.delete<{ Params: { templateId: string; endpointId: string } }>(
    '/api/templates/:templateId/endpoints/:endpointId',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { endpointId } = req.params;
      const deleted = await db.deleteEndpoint(endpointId, userId);
      if (!deleted) return reply.status(404).send({ error: '接入点不存在或无权限' });
      return reply.send({ ok: true });
    }
  );

  // ── POST /api/templates/:templateId/endpoints/:endpointId/render ──────────
  // Phase 1 + Phase 2：传入外部数据，按 field_mapping 转换后渲染模板，返回 HTML。
  // 支持可选的 shopIntegrationId 参数，自动注入 Shoplazza shop.* / product.* 数据。
  app.post<{
    Params: { templateId: string; endpointId: string };
    Body: { data?: Record<string, unknown>; shopIntegrationId?: string };
  }>(
    '/api/templates/:templateId/endpoints/:endpointId/render',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { templateId, endpointId } = req.params;
      const { data = {}, shopIntegrationId } = req.body ?? {};

      const endpoint = await db.getEndpoint(endpointId, userId);
      if (!endpoint) return reply.status(404).send({ error: '接入点不存在或无权限' });

      const template = await db.getTemplate(templateId);
      if (!template) return reply.status(404).send({ error: '模板不存在' });
      if (!template.is_public && template.user_id !== userId) return reply.status(403).send({ error: '无权访问该模板' });

      // Phase 1：按 field_mapping 将外部数据映射为模板变量
      const mappedData = applyFieldMapping(data, endpoint.field_mapping);

      // 分离标量与数组变量
      const scalars: Record<string, string> = {};
      const arrays: Record<string, Record<string, string>[]> = {};
      for (const [k, v] of Object.entries(mappedData)) {
        if (Array.isArray(v)) {
          arrays[k] = v as Record<string, string>[];
        } else if (v !== null && v !== undefined) {
          scalars[k] = String(v);
        }
      }

      // Phase 2：若提供 shopIntegrationId，自动注入 Shoplazza 数据（优先级低于外部传入数据）
      if (shopIntegrationId) {
        try {
          const shopData = await getShoplazzaPreviewData(shopIntegrationId);
          for (const [k, v] of Object.entries(shopData)) {
            if (!(k in scalars)) scalars[k] = v;
          }
        } catch (err) {
          console.warn('[render] Failed to fetch Shoplazza data:', err instanceof Error ? err.message : err);
        }
      }

      const html = renderTemplate(
        {
          components: Array.isArray(template.components) ? template.components : [],
          config: template.config ?? {},
          title: template.title,
        },
        { scalars, arrays },
        { showVariablesSummary: true }
      );

      return reply.send({ html, mappedData, templateId, endpointId });
    }
  );

  // ── POST /api/templates/:templateId/endpoints/:endpointId/send ─────────────
  // Phase 4：外部 API 触发发送接口。
  // 请求体：{ to: string, data?: object, shopIntegrationId?: string, gmailAccountId: string, subject: string }
  // 鉴权：JWT（已登入用户）
  app.post<{
    Params: { templateId: string; endpointId: string };
    Body: {
      to: string;
      subject: string;
      gmailAccountId: string;
      data?: Record<string, unknown>;
      shopIntegrationId?: string;
    };
  }>(
    '/api/templates/:templateId/endpoints/:endpointId/send',
    async (req, reply) => {
      const userId = (req as AuthRequest).userId;
      const { templateId, endpointId } = req.params;
      const { to, subject, gmailAccountId, data = {}, shopIntegrationId } = req.body ?? {};

      if (!to?.trim()) return reply.status(400).send({ error: '缺少收件人邮箱（to）' });
      if (!subject?.trim()) return reply.status(400).send({ error: '缺少邮件主旨（subject）' });
      if (!gmailAccountId) return reply.status(400).send({ error: '缺少 Gmail 账号 ID（gmailAccountId）' });

      const endpoint = await db.getEndpoint(endpointId, userId);
      if (!endpoint) return reply.status(404).send({ error: '接入点不存在或无权限' });

      const template = await db.getTemplate(templateId);
      if (!template) return reply.status(404).send({ error: '模板不存在' });
      if (!template.is_public && template.user_id !== userId) return reply.status(403).send({ error: '无权访问该模板' });

      const auth = await db.getGmailAuthorizationById(gmailAccountId, userId);
      if (!auth) return reply.status(404).send({ error: '未找到该 Gmail 授权，请重新授权' });

      // 映射外部数据
      const mappedData = applyFieldMapping(data, endpoint.field_mapping);
      const scalars: Record<string, string> = {};
      const arrays: Record<string, Record<string, string>[]> = {};
      for (const [k, v] of Object.entries(mappedData)) {
        if (Array.isArray(v)) {
          arrays[k] = v as Record<string, string>[];
        } else if (v !== null && v !== undefined) {
          scalars[k] = String(v);
        }
      }

      // 注入 Shoplazza 数据
      if (shopIntegrationId) {
        try {
          const shopData = await getShoplazzaPreviewData(shopIntegrationId);
          for (const [k, v] of Object.entries(shopData)) {
            if (!(k in scalars)) scalars[k] = v;
          }
        } catch (err) {
          console.warn('[send] Failed to fetch Shoplazza data:', err instanceof Error ? err.message : err);
        }
      }

      const html = renderTemplate(
        {
          components: Array.isArray(template.components) ? template.components : [],
          config: template.config ?? {},
          title: template.title,
        },
        { scalars, arrays }
      );

      try {
        await sendViaGmail(auth, { to: to.trim(), subject: subject.trim(), html });
      } catch (err) {
        console.error('[send] Gmail send failed:', err);
        const msg = err instanceof Error ? err.message : '未知错误';
        const status = msg.includes('授权已过期') ? 401 : 500;
        return reply.status(status).send({ error: msg });
      }

      return reply.send({ ok: true, to: to.trim() });
    }
  );
}
