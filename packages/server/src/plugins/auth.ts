import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Placeholder single-tenant API key check — reads one static key from env.
 *
 * This is NOT the real auth model. Phase B's tenant system (hashed per-tenant
 * keys, `tenants`/`tenant_credentials` tables — see docs/architecture/api-sdk.md)
 * replaces this. Kept intentionally simple so every other route can depend on
 * "there is an auth check" without that check being backed by a database yet.
 */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.OSPREY_API_KEY;
  if (!expected) {
    // No key configured — server is running in local/dev mode, allow through.
    return;
  }
  const provided = Buffer.from(String(req.headers['x-api-key'] ?? ''));
  const want     = Buffer.from(expected);
  if (provided.length !== want.length || !timingSafeEqual(provided, want)) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid X-API-Key header' });
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate('requireApiKey', requireApiKey);
}
