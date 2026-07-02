import type { EngineStatus, FundingRate, HarvestConfig, RegimeState, StreamRateUpdate } from './types.js';

export interface OspreyClientOptions {
  /** Base URL of an Osprey API deployment, e.g. https://api.osprey.example */
  baseUrl: string;
  /** API key for authenticated endpoints (config/engine control). Not required for public rate reads. */
  apiKey?: string;
}

type StreamEvent = StreamRateUpdate; // more event types land here as the server emits them
type StreamListener = (event: StreamEvent) => void;

/**
 * Typed client for the Osprey API. Thin by design — see
 * docs/architecture/api-sdk.md Phase C: this wraps HTTP/WebSocket calls, it
 * does not reimplement any engine logic.
 */
export class Osprey {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: OspreyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Osprey API error ${res.status}: ${body || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  readonly rates = {
    list: async (): Promise<FundingRate[]> => {
      const { rates } = await this.request<{ rates: FundingRate[] }>('/v1/rates');
      return rates;
    },
  };

  readonly regime = {
    get: async (): Promise<RegimeState> => {
      const { regime } = await this.request<{ regime: RegimeState }>('/v1/regime');
      return regime;
    },
  };

  readonly config = {
    get: async (): Promise<HarvestConfig> => {
      const { config } = await this.request<{ config: HarvestConfig }>('/v1/config');
      return config;
    },
    update: async (partial: Partial<HarvestConfig>): Promise<HarvestConfig> => {
      const { config } = await this.request<{ config: HarvestConfig }>('/v1/config', {
        method: 'PUT',
        body: JSON.stringify(partial),
      });
      return config;
    },
  };

  readonly engine = {
    status: async (): Promise<EngineStatus> => this.request<EngineStatus>('/v1/engine/status'),
    arm: async (): Promise<{ armed: boolean }> =>
      this.request('/v1/engine/arm', { method: 'POST' }),
    enable: async (): Promise<{ running: boolean }> =>
      this.request('/v1/engine/enable', { method: 'POST' }),
    disable: async (): Promise<{ running: boolean }> =>
      this.request('/v1/engine/disable', { method: 'POST' }),
  };

  /**
   * Open the rate-update WebSocket stream. Returns an unsubscribe function.
   * Reconnection is intentionally minimal (fixed delay) — this is a scaffold,
   * not a production-hardened reconnect strategy yet.
   *
   * Requires a global `WebSocket` (native in browsers and Node 22+). Older
   * Node runtimes need a polyfill (e.g. `ws` + a small shim) — not bundled
   * here to avoid forcing that dependency on browser consumers.
   */
  stream(onEvent: StreamListener): () => void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/v1/stream';
    let closed = false;
    let socket: WebSocket | undefined;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(wsUrl);
      socket.onmessage = (msg) => {
        try {
          onEvent(JSON.parse(msg.data as string) as StreamEvent);
        } catch {
          // malformed frame — ignore rather than crash the listener
        }
      };
      socket.onclose = () => {
        if (!closed) setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      closed = true;
      socket?.close();
    };
  }
}
