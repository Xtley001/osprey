// ── FEE NOTICE ────────────────────────────────────────────────────────────────
// Fee values in this file are FALLBACK values (HL Tier 0 base rate).
// Runtime trading logic fetches LIVE fees from HL API via useFeeStore.
// See: src/api/fees.ts, src/store/feeStore.ts, src/hooks/useFees.ts
// NEVER use constants here for actual fee calculations — always use useFeeStore.
// ──────────────────────────────────────────────────────────────────────────────

// P0-11: Testnet switching. When VITE_ENABLE_TESTNET=true both REST and WS
// base URLs redirect to HL testnet. All consumers import these constants so the
// switch is global — no per-file hostname literals needed.
export const ENABLE_TESTNET = import.meta.env.VITE_ENABLE_TESTNET === 'true';

export const HL_REST_URL = ENABLE_TESTNET
  ? (import.meta.env.VITE_HL_TESTNET_REST ?? 'https://api.hyperliquid-testnet.xyz')
  : (import.meta.env.VITE_HL_REST_URL     ?? 'https://api.hyperliquid.xyz');

export const HL_WS_URL = ENABLE_TESTNET
  ? (import.meta.env.VITE_HL_TESTNET_WS ?? 'wss://api.hyperliquid-testnet.xyz/ws')
  : (import.meta.env.VITE_HL_WS_URL     ?? 'wss://api.hyperliquid.xyz/ws');

// OP-09 hardened: real trading requires explicit opt-in (=== 'true'), not opt-out.
export const ENABLE_REAL_TRADING  = import.meta.env.VITE_ENABLE_REAL_TRADING  === 'true';
export const ENABLE_AGENT_KEYS    = import.meta.env.VITE_ENABLE_AGENT_KEYS    !== 'false';
export const WALLETCONNECT_PROJECT = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';

export const RATE_POLL_INTERVAL = 30_000;   // 30s — aggressive polling for live-only operation
export const MIN_OI_THRESHOLD   = 1_000_000;
export const ROTATION_THRESHOLD = 0.00003;

// ── Rate tier thresholds ───────────────────────────────────────────────────────
export const RATE_TIERS = {
  subThreshold: 0.00005,   // 0.005%/hr — floor for consideration (43.8% APY)
  core:         0.0001,    // 0.010%/hr — steady positive carry (87.6% APY)
  elevated:     0.0002,    // 0.020%/hr — elevated rates (175.2% APY)
  hot:          0.0005,    // 0.050%/hr — hot regime (438% APY)
  exit:         0.00003,   // 0.003%/hr — exit threshold (below break-even after fees)
} as const;

export function classifyTier(rate: number): 'sub' | 'core' | 'elevated' | 'hot' {
  if (rate >= RATE_TIERS.hot)      return 'hot';
  if (rate >= RATE_TIERS.elevated) return 'elevated';
  if (rate >= RATE_TIERS.core)     return 'core';
  return 'core';
}

export const DEFAULT_STRATEGY = {
  entryRateThreshold: 0.00005,
  exitRateThreshold:  0.00003,
  minHoursElevated:   0,
  maxHoldHours:       720,
  capitalUSDC:        1000,
  rebalanceThreshold: 2,    // 2% — tight hedge maintenance
  // takerFee and makerFee: loaded at runtime from useFeeStore
  takerFee:           0.00045,  // HL Tier 0 base (overridden by useFeeStore)
  makerFee:           0.00015,  // HL Tier 0 base (overridden by useFeeStore)
} as const;

// ── Pair categorisation ───────────────────────────────────────────────────────
export const TRADFI_PAIRS = new Set([
  'NVDA','AAPL','GOOGL','GOOG','TSLA','AMZN','MSFT','META','NFLX',
  'AMD','INTC','COIN','MSTR','PLTR','BABA','ORCL','UBER','SNAP',
  'SPACEX','GOLD','SILVER','WTIOIL','NATGAS','COPPER','SPY','QQQ','DXY','TSM','USAR',
]);

export const HIP3_PAIRS = new Set([
  'MAVIA','PURR','HFUN','JEFF','TRUMP','MELANIA','LAYER',
]);

export const PRELAUNCH_PAIRS = new Set<string>([]);

export function classifyPairCategory(
  symbol: string,
  isPrelaunch = false
): 'TradFi' | 'HIP-3' | 'Pre-launch' | 'Crypto' {
  if (isPrelaunch || PRELAUNCH_PAIRS.has(symbol)) return 'Pre-launch';
  if (TRADFI_PAIRS.has(symbol))  return 'TradFi';
  if (HIP3_PAIRS.has(symbol))    return 'HIP-3';
  return 'Crypto';
}
