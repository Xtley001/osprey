export const HL_REST_URL = 'https://api.hyperliquid.xyz';
export const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
export const HL_TESTNET_REST = 'https://api.hyperliquid-testnet.xyz';
export const HL_TESTNET_WS = 'wss://api.hyperliquid-testnet.xyz/ws';

export const RATE_POLL_INTERVAL = 60_000;  // 60s
export const DEMO_INITIAL_BALANCE = 10_000;

export const MIN_OI_THRESHOLD = 500_000;   // $500k
export const ROTATION_THRESHOLD = 0.0002;  // 0.02%

export const DEFAULT_STRATEGY = {
  entryRateThreshold: 0.0004,   // 0.04%/hr
  exitRateThreshold:  0.0002,   // 0.02%/hr
  minHoursElevated:   2,
  maxHoldHours:       72,
  capitalUSDC:        5000,
  rebalanceThreshold: 5,
  takerFee:           0.00035,  // 0.035%
  makerFee:           0.0001,   // 0.01%
} as const;

export const TRADFI_PAIRS = ['NVDA', 'AAPL', 'GOOGL', 'TSLA', 'AMZN', 'MSFT', 'META', 'GOLD', 'SILVER', 'WTIOIL', 'SPACEX', 'SPY'];
