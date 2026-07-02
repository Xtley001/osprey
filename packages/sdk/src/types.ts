/**
 * Wire types for the Osprey API. Intentionally NOT imported from
 * @osprey/engine (private, unpublished) — see docs/architecture/api-sdk.md,
 * Phase C, for why these are a deliberately separate, independently
 * versioned contract rather than a re-export.
 */

export interface FundingRate {
  symbol: string;
  currentRate: number;
  predictedRate: number;
  openInterest: number;
  volume24h: number;
  price: number;
  nextFundingTime: number;
}

export type RegimeLabel = 'HOT' | 'NEUTRAL' | 'COLD';

export interface RegimeState {
  label: RegimeLabel;
  avgRateHr: number;
  breadthPct: number;
  confidence: number;
}

export interface HarvestConfig {
  enabled: boolean;
  maxPositions: number;
  capitalPerPosition: number;
  minFundingRateAPR: number;
  maxHoldHours: number;
  maxDrawdownPct: number;
  rebalanceThreshold: number;
  hedgeMode: 'hl_spot' | 'external_spot' | 'perp_only' | 'none';
  [key: string]: unknown; // config has more knobs than the SDK pins explicitly
}

export interface EngineStatus {
  armed: boolean;
  running: boolean;
  config: HarvestConfig;
  recentLog: unknown[];
}

export interface StreamRateUpdate {
  type: 'rate:update';
  rates: FundingRate[];
}
