export interface AutoTraderConfig {
  enabled:            boolean;
  mode:               'demo' | 'real';  // must match app mode
  capitalPerPosition: number;           // USDC per position leg
  maxPositions:       number;           // max concurrent positions (1–5)
  entryThreshold:     number;           // min rate to enter (e.g. 0.0004 = 0.04%/hr)
  exitThreshold:      number;           // rate below which to exit (e.g. 0.0002)
  minHoursElevated:   number;           // consecutive hours above threshold before entry
  maxHoldHours:       number;           // force-exit after this many hours
  rotationEnabled:    boolean;          // rotate to higher-rate pair if profitable
  rotationAdvantage:  number;           // min rate delta to justify rotation fees
  regimeGate:         boolean;          // pause entries in COLD regime
  minOI:              number;           // skip pairs with OI below this (liquidity filter)
}

export interface AutoTraderLogEntry {
  id:        number;
  timestamp: number;
  type:      'ENTRY' | 'EXIT' | 'ROTATE' | 'SKIP' | 'ERROR' | 'INFO';
  symbol:    string;
  message:   string;
  rate?:     number;
  pnl?:      number;
}

export interface AutoTraderState {
  config:      AutoTraderConfig;
  running:     boolean;
  lastRunAt:   number;
  nextRunAt:   number;
  log:         AutoTraderLogEntry[];
  totalAutoEarned: number;
  totalAutoFees:   number;
}

export const DEFAULT_AUTO_CONFIG: AutoTraderConfig = {
  enabled:            false,
  mode:               'demo',
  capitalPerPosition: 1000,
  maxPositions:       3,
  entryThreshold:     0.0004,   // 0.04%/hr — only elevated rates
  exitThreshold:      0.0002,   // 0.02%/hr — exit when rate drops
  minHoursElevated:   2,        // 2hr confirmation before entering
  maxHoldHours:       48,
  rotationEnabled:    true,
  rotationAdvantage:  0.0002,   // need 0.02%/hr advantage to justify rotation fees
  regimeGate:         true,
  minOI:              1_000_000, // $1M OI minimum
};
