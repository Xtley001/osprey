import { describe, it, expect, vi, afterEach } from 'vitest';
import { Osprey } from '../src/client.js';

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

describe('Osprey SDK client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rates.list() hits GET /v1/rates and unwraps the rates array', async () => {
    mockFetchOnce({ rates: [{ symbol: 'BTC', currentRate: 0.0001 }] });
    const osprey = new Osprey({ baseUrl: 'http://localhost:8787' });

    const rates = await osprey.rates.list();

    expect(rates).toEqual([{ symbol: 'BTC', currentRate: 0.0001 }]);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/rates',
      expect.objectContaining({ headers: expect.not.objectContaining({ 'X-API-Key': expect.anything() }) })
    );
  });

  it('sends X-API-Key header when apiKey is configured', async () => {
    mockFetchOnce({ config: { maxPositions: 100 } });
    const osprey = new Osprey({ baseUrl: 'http://localhost:8787', apiKey: 'sk_test_123' });

    await osprey.config.get();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/config',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': 'sk_test_123' }) })
    );
  });

  it('config.update() PUTs the partial config and returns the updated config', async () => {
    mockFetchOnce({ config: { maxPositions: 50 } });
    const osprey = new Osprey({ baseUrl: 'http://localhost:8787', apiKey: 'k' });

    const config = await osprey.config.update({ maxPositions: 50 });

    expect(config).toEqual({ maxPositions: 50 });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/config',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ maxPositions: 50 }) })
    );
  });

  it('throws with status and body text on a non-OK response', async () => {
    mockFetchOnce({ error: 'unauthorized' }, { ok: false, status: 401 });
    const osprey = new Osprey({ baseUrl: 'http://localhost:8787' });

    await expect(osprey.rates.list()).rejects.toThrow(/401/);
  });

  it('strips a trailing slash from baseUrl', async () => {
    mockFetchOnce({ rates: [] });
    const osprey = new Osprey({ baseUrl: 'http://localhost:8787/' });

    await osprey.rates.list();

    expect(fetch).toHaveBeenCalledWith('http://localhost:8787/v1/rates', expect.anything());
  });
});
