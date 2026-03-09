import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { COMPONENT_SPEC, getSpecByType } from '../data/componentSpec.js';

export async function registerComponentSpecRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/component-spec', async (req: FastifyRequest<{ Querystring: { type?: string } }>, reply: FastifyReply) => {
    const type = req.query.type;
    if (type) {
      const spec = getSpecByType(type);
      if (!spec) return reply.status(404).send({ error: `未知組件類型: ${type}` });
      return reply.send(spec);
    }
    return reply.send(COMPONENT_SPEC);
  });
}
