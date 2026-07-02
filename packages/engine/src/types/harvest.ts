// ── Harvest Engine Types ───────────────────────────────────────────────────────
// Live-only delta-neutral funding rate harvesting

export interface HarvestConfig {
  enabled:            boolean;

  // Capital management
  capitalPerPosition: number;
  maxPositions:       number;
  marginUtilization:  number;

  // Entry / exit thresholds (decimal per hour)
  entryThreshold:     number;
  exitThreshold:      number;

  // Hold limits
  minHoursElevated:   number;  // kept as 0 — no longer gates entry
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

  // Risk controls (Phase 2)
  maxDrawdownPct:       number;   // portfolio circuit breaker (0 = disabled)
  maxPairLossPct:       number;   // per-pair unrealized loss trigger (0 = disabled)
  liquidationBufferPct: number;   // min margin % before pausing entries (0 = disabled)

  // Phase 6.3 / R-07: drift rebalance threshold (0.02 = 2% price drift triggers rebalance)
  rebalanceThreshold:   number;
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
  perpOrderId?: string;
  spotOrderId?: string;
}

export type HarvestEventType =
  | 'ENTER_PERP' | 'ENTER_SPOT' | 'ENTER_COMPLETE' | 'ENTER_FAILED'
  | 'EXIT_PERP'  | 'EXIT_SPOT'  | 'EXIT_COMPLETE'  | 'EXIT_FAILED'
  | 'REBALANCE' | 'FUNDING_ACCRUED' | 'REGIME_CHANGE'
  | 'SKIP' | 'ERROR' | 'INFO' | 'ENTRY' | 'EXIT' | 'ROTATE'
  | 'ROTATE_FAILED';  // Phase 3.3 / R8

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

// ── Live-only defaults ─────────────────────────────────────────────────────────
export const DEFAULT_HARVEST_CONFIG: HarvestConfig = {
  enabled:             false,
  capitalPerPosition:  1000,
  maxPositions:        100,
  marginUtilization:   0.80,
  entryThreshold:      0.00005,   // 0.005%/hr — enter immediately above this
  exitThreshold:       0.00003,   // 0.003%/hr — hard exit floor
  minHoursElevated:    0,         // removed gate — enter immediately
  maxHoldHours:        720,       // 30 days — let winners run
  rotationEnabled:     true,
  rotationAdvantage:   0.00003,   // 0.003%/hr min rate gain to justify rotation
  regimeGate:          true,      // gate on COLD — NEUTRAL and HOT both allow entry
  minOI:               1_000_000,
  hedgeMode:           'hl_spot',
  // Risk controls
  maxDrawdownPct:      15,
  maxPairLossPct:      5,
  liquidationBufferPct: 10,
  rebalanceThreshold:  0.02,   // 2% price drift triggers spot rebalance
};
