// ── Harvest Engine Types ───────────────────────────────────────────────────────
// Replaces autotrader.ts — full delta-neutral position lifecycle

export interface HarvestConfig {
  enabled:            boolean;
  mode:               'demo' | 'real';

  // Capital management
  capitalPerPosition: number;
  maxPositions:       number;
  marginUtilization:  number;

  // Entry / exit thresholds (decimal per hour)
  entryThreshold:     number;
  exitThreshold:      number;

  // Hold limits
  minHoursElevated:   number;
  maxHoldHours:       number;

  // Rotation
  rotationEnabled:    boolean;
  rotationAdvantage:  number;

  // Regime gate
  regimeGate:         boolean;

  // Liquidity filter
  minOI:              number;

  // Hedging mode
  hedgeMode: 'hl_spot' | 'external_spot' | 'perp_only';

  // Demo
  isDemo:              boolean;
  demoStartingBalance: number;
}

export interface HarvestPosition {
  id:            string;
  symbol:        string;
  entryTime:     number;
  perpNotional:  number;
  spotNotional:  number;
  entryPrice:    number;
  entryRate:     number;
  currentPrice:  number;
  currentRate:   number;
  fundingEarned:      number;
  feesPaid:           number;
  notional:      number;
  fundingEarnedGross: number;
  hedgeDrift:    number;
  lastRebalance: number;
  hoursHeld:     number;
  state:  'ACTIVE' | 'REBALANCING' | 'EXITING' | 'ERROR';
  isDemo: boolean;
  perpOrderId?: string;
  spotOrderId?: string;
}

export type HarvestEventType =
  | 'ENTER_PERP' | 'ENTER_SPOT' | 'ENTER_COMPLETE' | 'ENTER_FAILED'
  | 'EXIT_PERP'  | 'EXIT_SPOT'  | 'EXIT_COMPLETE'  | 'EXIT_FAILED'
  | 'REBALANCE' | 'FUNDING_ACCRUED' | 'REGIME_CHANGE'
  | 'SKIP' | 'ERROR' | 'INFO' | 'ENTRY' | 'EXIT' | 'ROTATE';

export interface HarvestLogEntry {
  id:        number;
  timestamp: number;
  type:      HarvestEventType;
  symbol:    string;
  message:   string;
  rate?:     number;
  pnl?:      number;
}

export interface HarvestState {
  config:          HarvestConfig;
  running:         boolean;
  lastRunAt:       number;
  nextRunAt:       number;
  log:             HarvestLogEntry[];
  totalAutoEarned: number;
  totalAutoFees:   number;
}

// ── Corrected defaults — replaces spike-chasing thresholds ────────────────────
export const DEFAULT_HARVEST_CONFIG: HarvestConfig = {
  enabled:             false,
  mode:                'demo',
  capitalPerPosition:  1000,
  maxPositions:        100,
  marginUtilization:   0.80,
  entryThreshold:      0.00005,   // 0.005%/hr — steady positive carry
  exitThreshold:       0.00003,   // 0.003%/hr — near break-even floor
  minHoursElevated:    1,
  maxHoldHours:        720,
  rotationEnabled:     true,
  rotationAdvantage:   0.00005,
  regimeGate:          true,
  minOI:               1_000_000,
  hedgeMode:           'hl_spot',
  isDemo:              true,
  demoStartingBalance: 10_000,
};

