import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { authPlugin, requireApiKey } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { ratesRoutes } from './routes/rates.js';
import { configRoutes } from './routes/config.js';
import { engineRoutes } from './routes/engine.js';
import { streamRoutes } from './routes/stream.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireApiKey: typeof requireApiKey;
  }
}

/**
 * App factory, separate from listen() — lets tests build the app and use
 * `.inject()` without binding a real port.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(websocket);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(ratesRoutes);
  await app.register(configRoutes);
  await app.register(engineRoutes);
  await app.register(streamRoutes);

  return app;
}
