import type { FastifyInstance } from 'fastify';
import { fetchFundingRates, detectRegime } from '@osprey/engine';

/**
 * Public, unauthenticated — mirrors what the Scanner page shows in the web
 * app. No tenant-specific data here, so no API key required.
 */
export async function ratesRoutes(app: FastifyInstance) {
  app.get('/v1/rates', async (_req, reply) => {
    try {
      const rates = await fetchFundingRates();
      return { rates };
    } catch (err) {
      app.log.error(err, 'fetchFundingRates failed');
      return reply.code(502).send({ error: 'upstream_error', message: 'Failed to fetch rates from Hyperliquid' });
    }
  });

  app.get('/v1/regime', async (_req, reply) => {
    try {
      const rates = await fetchFundingRates();
      const top20 = [...rates].sort((a, b) => b.openInterest - a.openInterest).slice(0, 20);
      const { regime } = detectRegime(top20, 0);
      return { regime };
    } catch (err) {
      app.log.error(err, 'detectRegime failed');
      return reply.code(502).send({ error: 'upstream_error', message: 'Failed to compute regime' });
    }
  });
}
