import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('server smoke tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('GET /v1/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /v1/config returns the default harvest config', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().config).toHaveProperty('maxPositions');
  });

  it('POST /v1/engine/enable without arming first returns 409', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/engine/enable' });
    expect(res.statusCode).toBe(409);
  });

  it('arm then enable succeeds', async () => {
    await app.inject({ method: 'POST', url: '/v1/engine/arm' });
    const res = await app.inject({ method: 'POST', url: '/v1/engine/enable' });
    expect(res.statusCode).toBe(200);
    expect(res.json().running).toBe(true);
  });
});
