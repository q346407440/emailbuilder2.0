import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import { getPreviewPath } from '../lib/preview.js';
import { screenshotHtml } from '../lib/screenshotService.js';

export async function registerPreviewsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { kind: string; id: string } }>(
    '/api/previews/:kind/:id',
    async (req, reply) => {
      const { kind, id } = req.params;
      if (kind !== 'templates' && kind !== 'composites') {
        return reply.status(400).send({ error: 'kind 須為 templates 或 composites' });
      }
      const filePath = getPreviewPath(kind as 'templates' | 'composites', id);
      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: '預覽圖不存在' });
      }
      const buf = fs.readFileSync(filePath);
      return reply.header('Content-Type', 'image/png').send(buf);
    }
  );

  /**
   * POST /api/screenshot
   * 接受 { html: string, width?: number } 并返回 PNG 截图。
   * 使用真实 Chrome（puppeteer-core）渲染，结果与浏览器一致。
   */
  app.post<{ Body: { html: string; width?: number } }>(
    '/api/screenshot',
    {
      config: {},
      schema: {
        body: {
          type: 'object',
          required: ['html'],
          properties: {
            html: { type: 'string' },
            width: { type: 'number' },
          },
        },
      },
    },
    async (req, reply) => {
      const { html, width } = req.body;
      if (!html || typeof html !== 'string') {
        return reply.status(400).send({ error: 'html 字段必填' });
      }
      try {
        const buf = await screenshotHtml(html, width);
        return reply
          .header('Content-Type', 'image/png')
          .header('Cache-Control', 'no-store')
          .send(buf);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[screenshot] error:', msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );
}
