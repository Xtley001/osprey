import type { FastifyInstance } from 'fastify';
import { getEngineState, updateConfig } from '../state.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/v1/config', { preHandler: app.requireApiKey }, async () => {
    return { config: getEngineState().config };
  });

  app.put('/v1/config', { preHandler: app.requireApiKey }, async (req) => {
    const partial = req.body as Record<string, unknown>;
    return { config: updateConfig(partial) };
  });
}
