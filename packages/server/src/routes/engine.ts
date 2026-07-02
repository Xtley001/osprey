import type { FastifyInstance } from 'fastify';
import { getEngineState, arm, setRunning } from '../state.js';

/**
 * Engine control surface — mirrors ArmEngineModal / the Harvest page's
 * arm/enable/disable flow in the web app.
 *
 * IMPORTANT: enable() here only flips an in-memory flag. It does not yet run
 * a real harvest cycle against Hyperliquid — that requires the server-side
 * agent-key custody (KMS envelope encryption) described in
 * docs/architecture/api-sdk.md Phase B, which this scaffold intentionally
 * does not implement. Wiring a real cycle runner to this endpoint without
 * that secrets model would mean holding private keys in plaintext env vars —
 * explicitly not acceptable for a system funds will trust with capital.
 */
export async function engineRoutes(app: FastifyInstance) {
  app.get('/v1/engine/status', { preHandler: app.requireApiKey }, async () => {
    const { armed, running, config, log } = getEngineState();
    return { armed, running, config, recentLog: log.slice(0, 20) };
  });

  app.post('/v1/engine/arm', { preHandler: app.requireApiKey }, async () => {
    arm();
    return { armed: true };
  });

  app.post('/v1/engine/enable', { preHandler: app.requireApiKey }, async (_req, reply) => {
    try {
      setRunning(true);
      return { running: true };
    } catch (err) {
      return reply.code(409).send({ error: 'not_armed', message: (err as Error).message });
    }
  });

  app.post('/v1/engine/disable', { preHandler: app.requireApiKey }, async () => {
    setRunning(false);
    return { running: false };
  });
}
