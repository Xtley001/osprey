import type { FastifyInstance } from 'fastify';
import { fetchFundingRates } from '@osprey/engine';

const POLL_INTERVAL_MS = 30_000; // matches RATE_POLL_INTERVAL in @osprey/engine

/**
 * Rate-update stream. One upstream poll loop per server process, fanned out
 * to every connected client — not one poll per client.
 *
 * Position/trade/log events (the other half of what the design doc describes)
 * get added here once they have a real source (Phase B's cycle runner) —
 * intentionally not stubbed with fake data.
 */
export async function streamRoutes(app: FastifyInstance) {
  app.get('/v1/stream', { websocket: true }, (socket) => {
    let closed = false;
    socket.on('close', () => { closed = true; });

    const tick = async () => {
      if (closed) return;
      try {
        const rates = await fetchFundingRates();
        socket.send(JSON.stringify({ type: 'rate:update', rates }));
      } catch (err) {
        app.log.error(err, 'stream: fetchFundingRates failed');
      }
    };

    void tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    socket.on('close', () => clearInterval(interval));
  });
}
