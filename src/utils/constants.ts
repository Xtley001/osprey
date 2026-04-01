// URLs fall back to mainnet if env vars are not set (e.g. running tests without .env)
export const HL_REST_URL     = import.meta.env.VITE_HL_REST_URL     ?? 'https://api.hyperliquid.xyz';
export const HL_WS_URL       = import.meta.env.VITE_HL_WS_URL       ?? 'wss://api.hyperliquid.xyz/ws';
export const HL_TESTNET_REST = import.meta.env.VITE_HL_TESTNET_REST ?? 'https://api.hyperliquid-testnet.xyz';
export const HL_TESTNET_WS   = import.meta.env.VITE_HL_TESTNET_WS   ?? 'wss://api.hyperliquid-testnet.xyz/ws';

/** Set to 'false' in .env to hide the Live Mode toggle in the UI */
export const ENABLE_REAL_TRADING = import.meta.env.VITE_ENABLE_REAL_TRADING !== 'false';
export const ENABLE_TESTNET      = import.meta.env.VITE_ENABLE_TESTNET      !== 'false';

export const RATE_POLL_INTERVAL = 60_000;
export const DEMO_INITIAL_BALANCE = 10_000;
export const MIN_OI_THRESHOLD = 500_000;
export const ROTATION_THRESHOLD = 0.0002;

export const DEFAULT_STRATEGY = {
  entryRateThreshold: 0.0004,
  exitRateThreshold:  0.0002,
  minHoursElevated:   2,
  maxHoldHours:       72,
  capitalUSDC:        5000,
  rebalanceThreshold: 5,
  takerFee:           0.00035,
  makerFee:           0.0001,
} as const;

// ── Pair categorisation ───────────────────────────────────────────────────────
// HL's API does not return a category field. We derive it from these lists.
// Update when HL adds new TradFi or HIP-3 listings.

/** Stocks, ETFs, commodities, and private-company perps on Hyperliquid */
export const TRADFI_PAIRS = new Set([
  // US large-cap stocks
  'NVDA','AAPL','GOOGL','GOOG','TSLA','AMZN','MSFT','META','NFLX',
  'AMD','INTC','COIN','MSTR','PLTR','BABA','ORCL','UBER','SNAP',
  // Private companies
  'SPACEX',
  // Commodities
  'GOLD','SILVER','WTIOIL','NATGAS','COPPER',
  // ETFs / indices
  'SPY','QQQ','DXY',
  // Asian tech
  'TSM','USAR',
]);

/**
 * HIP-3 pairs — community-deployed perpetuals with a custom fee structure.
 * Identified by the `onlyIsolated: true` flag in HL's universe response,
 * or by manual tracking of HL governance proposals.
 */
export const HIP3_PAIRS = new Set([
  'MAVIA','PURR','HFUN','JEFF','TRUMP','MELANIA','LAYER',
]);

/**
 * Pre-launch pairs — in Dutch auction phase, not yet tradeable as standard perps.
 * These appear in the universe with isDelisted or pre_launch flags.
 */
export const PRELAUNCH_PAIRS = new Set<string>([
  // Updated as HL announces new pre-launch auctions
]);

/** Classify a symbol into its display category */
export function classifyPairCategory(
  symbol: string,
  isPrelaunch = false
): 'TradFi' | 'HIP-3' | 'Pre-launch' | 'Crypto' {
  if (isPrelaunch || PRELAUNCH_PAIRS.has(symbol)) return 'Pre-launch';
  if (TRADFI_PAIRS.has(symbol))  return 'TradFi';
  if (HIP3_PAIRS.has(symbol))    return 'HIP-3';
  return 'Crypto';
}
