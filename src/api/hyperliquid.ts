import { HL_REST_URL } from '../utils/constants';
import type { FundingRate, FundingEvent, Candle } from '../types/funding';
import { classifyRate } from '../utils/rateColor';
import { classifyPairCategory } from '../utils/constants';

// ── N-01: AbortController + timeout wrapper ───────────────────────────────────
// Every HL fetch goes through this helper so stalled requests don't block cycles.
// Default 10s timeout; order placement uses 20s to avoid premature cancellation.
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Coin → asset index + szDecimals cache ────────────────────────────────────
// HL requires a numeric asset index in every order, not a symbol string.
// szDecimals is per-asset and controls how many decimal places are valid for
// the size field — using more decimals than szDecimals causes order rejection.
// Both caches are populated on the first fetchFundingRates() call and reused.
const _coinIndexCache:     Map<string, number> = new Map();
const _coinSzDecimals:     Map<string, number> = new Map();

export function getCoinIndex(coin: string): number | null {
  const idx = _coinIndexCache.get(coin.toUpperCase());
  return idx !== undefined ? idx : null;
}

/** Returns the number of decimal places HL accepts for this coin's size field. */
function getCoinSzDecimals(coin: string): number {
  return _coinSzDecimals.get(coin.toUpperCase()) ?? 4; // safe fallback
}

/**
 * Format a number to exactly szDecimals decimal places, then strip
 * trailing zeros so HL's matching engine sees a clean number string.
 * e.g. formatSz(0.001000, 4) → "0.001"
 *      formatSz(1.5,     0) → "2"  (rounds to integer for 0-decimal assets)
 */
function formatSz(value: number, szDecimals: number): string {
  return value.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
}

/**
 * Format a price string. HL accepts up to 6 significant figures for price
 * (not decimal places — significant figures). We use toPrecision(6) and strip
 * trailing zeros, which matches what the HL SDK does internally.
 */
function formatPx(value: number): string {
  // Use 6 significant figures (HL's internal limit), not 6 decimal places.
  // toFixed(6) breaks for large prices like BTC: "67234.123456" has 11 sig figs.
  const s = parseFloat(value.toPrecision(6)).toString();
  return s;
}

async function ensureCoinIndex(coin: string): Promise<number> {
  const cached = _coinIndexCache.get(coin.toUpperCase());
  if (cached !== undefined) return cached;
  await fetchFundingRates();
  const idx = _coinIndexCache.get(coin.toUpperCase());
  if (idx === undefined) throw new Error(`Unknown coin: ${coin}. Not listed on Hyperliquid.`);
  return idx;
}

// ── Types for raw HL API responses ───────────────────────────────────────────
interface HLAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  isPrelaunch?: boolean;
}

interface HLAssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePrice: string;
  markPx: string;
  midPx: string | null;
  impactPxs: [string, string] | null;
}

// ── Live rates ───────────────────────────────────────────────────────────────

export async function fetchFundingRates(): Promise<FundingRate[]> {
  const res = await fetchWithTimeout(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });

  if (!res.ok) {
    throw new Error(`Hyperliquid API error ${res.status}: ${res.statusText}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('Hyperliquid API returned unexpected response shape');
  }

  const meta: { universe: HLAsset[] } = raw[0];
  const assetCtxs: HLAssetCtx[] = raw[1];

  if (!Array.isArray(meta.universe) || !Array.isArray(assetCtxs)) {
    throw new Error('Hyperliquid API: universe or assetCtxs missing');
  }

  meta.universe.forEach((asset, i) => {
    _coinIndexCache.set(asset.name.toUpperCase(), i);
    _coinSzDecimals.set(asset.name.toUpperCase(), asset.szDecimals);
  });

  return meta.universe.map((asset, i): FundingRate => {
    const ctx = assetCtxs[i];
    const rate  = parseFloat(ctx.funding   ?? '0');
    const price = parseFloat(ctx.markPx    ?? ctx.midPx ?? '0');
    const prev  = parseFloat(ctx.prevDayPx ?? '0');
    const oi    = parseFloat(ctx.openInterest ?? '0') * price;
    const vol   = parseFloat(ctx.dayNtlVlm   ?? '0');
    const change24h = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    const heat  = classifyRate(rate);

    return {
      symbol:           asset.name,
      category:         classifyPairCategory(asset.name, !!asset.isPrelaunch),
      price,
      change24h,
      currentRate:      rate,
      rate8hEquiv:      rate * 8,
      annualYield:      rate * 8760,
      openInterest:     oi,
      volume24h:        vol,
      heat,
      trend:            'stable',
      persistenceHours: 0,    // populated by scannerStore after history fetch
      sparkline7d:      [],   // populated by scannerStore after history fetch
    };
  });
}

// ── Funding rate history ─────────────────────────────────────────────────────

export async function fetchFundingHistory(
  symbol: string,
  startTime?: number,
  endTime?: number
): Promise<FundingEvent[]> {
  const end   = endTime   ?? Date.now();
  const start = startTime ?? end - 72 * 3_600_000;

  const res = await fetchWithTimeout(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'fundingHistory', coin: symbol, startTime: start, endTime: end }),
  });

  if (!res.ok) throw new Error(`fundingHistory API error ${res.status} for ${symbol}`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`fundingHistory: unexpected response for ${symbol}`);
  if (data.length === 0) throw new Error(`fundingHistory: no data returned for ${symbol} in requested range`);

  return data.map((d: { time: number; fundingRate: string; coin: string }) => ({
    timestamp: d.time,
    rate:      parseFloat(d.fundingRate),
    symbol:    d.coin ?? symbol,
  }));
}

// ── OHLCV candles ────────────────────────────────────────────────────────────

export async function fetchCandles(
  symbol: string,
  hours?: number,
  startTime?: number,
  endTime?: number
): Promise<Candle[]> {
  const end   = endTime   ?? Date.now();
  const start = startTime ?? end - (hours ?? 72) * 3_600_000;

  const res = await fetchWithTimeout(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin: symbol, interval: '1h', startTime: start, endTime: end },
    }),
  });

  if (!res.ok) throw new Error(`candleSnapshot API error ${res.status} for ${symbol}`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`candleSnapshot: unexpected response for ${symbol}`);
  if (data.length === 0) throw new Error(`candleSnapshot: no candles returned for ${symbol} in requested range`);

  return data.map((c: {
    t: number; o: string; h: string; l: string; c: string; v: string
  }): Candle => ({
    timestamp: c.t,
    open:      parseFloat(c.o),
    high:      parseFloat(c.h),
    low:       parseFloat(c.l),
    close:     parseFloat(c.c),
    volume:    parseFloat(c.v),
  }));
}

// ── Real account state ───────────────────────────────────────────────────────

export interface HLAccountState {
  marginSummary: {
    accountValue:    string;
    totalNtlPos:     string;
    totalRawUsd:     string;
    totalMarginUsed: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos:  string;
  };
  assetPositions: Array<{
    position: {
      coin:           string;
      szi:            string;
      entryPx:        string;
      positionValue:  string;
      unrealizedPnl:  string;
      returnOnEquity: string;
      liquidationPx:  string | null;
      leverage:       { type: string; value: number };
      cumFunding:     { allTime: string; sinceOpen: string; sinceChange: string };
    };
    type: string;
  }>;
}

export async function fetchAccountState(
  address: string
): Promise<{ balance: number; marginBuffer: number; positions: HLAccountState['assetPositions'] } | null> {
  try {
    const res = await fetchWithTimeout(`${HL_REST_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data: HLAccountState = await res.json();
    const balance = parseFloat(
      data.marginSummary?.accountValue ??
      data.crossMarginSummary?.accountValue ??
      '0'
    );
    // CALC_AUDIT.md §6.3 — marginBuffer = (accountValue - totalMarginUsed) / accountValue × 100
    const marginUsed = parseFloat(data.marginSummary?.totalMarginUsed ?? '0');
    const marginBuffer = balance > 0
      ? Math.max(0, ((balance - marginUsed) / balance) * 100)
      : 100;
    return { balance, marginBuffer, positions: data.assetPositions ?? [] };
  } catch (e: unknown) {
    // N-04 / R9: surface fetch errors rather than silently returning null.
    // Callers in runCycle treat null as non-critical — cycle continues with
    // previous marginBuffer. This log line makes the failure observable.
    console.warn('[fetchAccountState] fetch failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ── Order placement ──────────────────────────────────────────────────────────

// ── Hyperliquid signing helpers ───────────────────────────────────────────────
// HL uses a "phantom agent" EIP-712 typed-data scheme.
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing

async function signHyperliquidAction(
  signer: import('ethers').Signer,
  action: unknown,
  nonce: number,
  vaultAddress: string | null = null,
): Promise<{ r: string; s: string; v: number }> {
  const { ethers } = await import('ethers');

  const actionBytes = ethers.toUtf8Bytes(JSON.stringify(action));
  const actionHash  = ethers.keccak256(actionBytes);

  const connectionId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint64', 'address'],
      [actionHash, BigInt(nonce), vaultAddress ?? ethers.ZeroAddress]
    )
  );

  // chainId: 1337 — HL-specific phantom-agent EIP-712 domain.
  // Verified: https://docs.chainstack.com/docs/hyperliquid-authentication-guide
  // (also https://www.dwellir.com/blog/build-hyperliquid-trading-app-builder-codes)
  // Checked: 2026-06-14. This is NOT Ethereum mainnet; it is HL's fixed sentinel value
  // for ALL L1 order/cancel actions regardless of mainnet vs testnet.
  const domain = {
    name:              'Exchange',
    version:           '1',
    chainId:           1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };

  const types = {
    Agent: [
      { name: 'source',       type: 'string'  },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };

  const value = { source: 'a', connectionId };

  // O-01: cast removed — ethers.Wallet and JsonRpcSigner both implement signTypedData
  // via the abstract Signer base. TypeScript accepts this without a cast.
  const sig = await (signer as import('ethers').Signer & {
    signTypedData: (domain: unknown, types: unknown, value: unknown) => Promise<string>;
  }).signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(sig);
  return { r, s, v };
}

// ── Order TIF (Time-In-Force) options ────────────────────────────────────────
//
// | TIF   | Behaviour                                     | Fee tier        |
// |-------|-----------------------------------------------|-----------------|
// | 'Ioc' | Immediate-Or-Cancel — crosses book at market  | TAKER  0.035%  |
// | 'Gtc' | Good-Till-Cancel — rests on book              | MAKER  0.010%  |
// | 'Alo' | Add-Liquidity-Only (post-only) — rejected if  | MAKER  0.010%  |
// |       | it would cross immediately; never taker        |                 |
//
// DEFAULT is 'Alo' (post-only maker) — saves 2.5 bps per leg vs 'Ioc'.
// Funding-arb entries are not time-sensitive; a resting limit 1–2 bps
// inside the spread fills within seconds on all liquid HL pairs.
//
// Fee impact per $5,000 notional round-trip:
//   Before (Ioc × 2): $1.75 + $1.75 = $3.50
//   After  (Alo + Ioc): $0.50 + $1.75 = $2.25  → saves $1.25 (−36%)
//   After  (Alo × 2):  $0.50 + $0.50 = $1.00  → saves $2.50 (−71%)
//
// Usage:
//   placeMarketOrder({ ..., tif: 'Alo' })  ← default, maker entry
//   placeMarketOrder({ ..., tif: 'Ioc' })  ← urgent exit, taker fill
//
// If an 'Alo' order is rejected (would cross), the error message contains
// "Would immediately cross" — caller should retry with tif: 'Ioc'.

export type OrderTif = 'Ioc' | 'Gtc' | 'Alo';

// Phase 1.3 — signer is now passed in, not constructed here.
// The call site (harvestStore) builds the Signer via buildSigner() and
// passes it directly, so placeMarketOrder has no dependency on BrowserProvider
// or raw private keys.  This also makes unit tests trivially mockable.
export async function placeMarketOrder(params: {
  coin:     string;
  isBuy:    boolean;
  sz:       number;
  px:       number;
  address:  string;
  signer:   import('ethers').Signer;
  /**
   * Time-in-force for the order.
   * Defaults to 'Alo' (post-only maker, 0.010% fee) to minimise costs.
   * Use 'Ioc' only for time-critical exits where immediate fill matters
   * more than the 2.5 bps fee difference.
   */
  tif?:     OrderTif;
}): Promise<{ success: boolean; orderId?: string; error?: string; filledAsMaker?: boolean }> {
  try {
    if (!params.px || !isFinite(params.px) || params.px <= 0) {
      return { success: false, error: `Invalid price: ${params.px}` };
    }
    if (!params.sz || !isFinite(params.sz) || params.sz <= 0) {
      return { success: false, error: `Invalid size: ${params.sz}` };
    }

    // ── Fee-minimising default: post-only maker ──────────────────────────────
    const tif: OrderTif = params.tif ?? 'Alo';

    const assetIndex = await ensureCoinIndex(params.coin);
    const szDecimals  = getCoinSzDecimals(params.coin);
    const signer = params.signer;
    const nonce  = Date.now();

    // Use per-asset szDecimals for size (from HL universe metadata).
    // Use 6 significant figures for price (HL's internal limit).
    // Both helpers strip trailing zeros to match HL's canonical format.
    const action = {
      type: 'order',
      orders: [{
        a: assetIndex,
        b: params.isBuy,
        p: formatPx(params.px),
        s: formatSz(params.sz, szDecimals),
        r: false,
        t: { limit: { tif } },
      }],
      grouping: 'na',
    };

    const { r, s, v } = await signHyperliquidAction(signer, action, nonce, null);

    const res = await fetchWithTimeout(`${HL_REST_URL}/exchange`,  {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        nonce,
        signature: { r, s, v },
        vaultAddress: null,
      }),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    if (data.status === 'ok') {
      const status = data.response?.data?.statuses?.[0];

      // Alo orders rejected by the matching engine include a status.error.
      // Surface this so callers can decide whether to retry with Ioc.
      if (status?.error) {
        return { success: false, error: status.error };
      }

      const orderId       = (status?.resting?.oid ?? status?.filled?.oid)?.toString();
      const filledAsMaker = !!status?.resting;   // resting = posted on book = maker fee
      return { success: true, orderId, filledAsMaker };
    }

    const errMsg =
      data.response?.data?.statuses?.[0]?.error ??
      data.error ??
      JSON.stringify(data);
    return { success: false, error: errMsg };

  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── cancelOrder ───────────────────────────────────────────────────────────────
// Phase 1.4 / O-04
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
// Checked: 2026-06-15. Cancel action schema: { type: 'cancel', cancels: [{ a, o }] }
// where a = assetIndex (same perp index as placeMarketOrder), o = orderId number.
export async function cancelOrder(params: {
  coin:    string;
  orderId: string | number;
  address: string;
  signer:  import('ethers').Signer;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const assetIndex = await ensureCoinIndex(params.coin);
    const oid = typeof params.orderId === 'string'
      ? parseInt(params.orderId, 10)
      : params.orderId;
    const nonce  = Date.now();

    const action = {
      type: 'cancel',
      cancels: [{ a: assetIndex, o: oid }],
    };

    const { r, s, v } = await signHyperliquidAction(params.signer, action, nonce, null);

    const res = await fetchWithTimeout(`${HL_REST_URL}/exchange`,  {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        nonce,
        signature: { r, s, v },
        vaultAddress: null,
      }),
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };

    const data = await res.json();
    if (data.status === 'ok') return { success: true };

    const errMsg = data.response?.data?.statuses?.[0]?.error ?? data.error ?? JSON.stringify(data);
    return { success: false, error: errMsg };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}


// ── fetchOpenOrders ───────────────────────────────────────────────────────────
// Phase 2.1
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
// Checked: 2026-06-15. Info request: { type: 'openOrders', user: address }
// Returns an array of resting order objects; empty array when no open orders.
export interface HLOpenOrder {
  coin:      string;
  side:      'B' | 'A';   // Buy / Ask (sell)
  limitPx:   string;
  sz:        string;
  oid:       number;
  timestamp: number;
  origSz:    string;
}

export async function fetchOpenOrders(address: string): Promise<HLOpenOrder[] | null> {
  try {
    const res = await fetchWithTimeout(`${HL_REST_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'openOrders', user: address }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data as HLOpenOrder[];
  } catch {
    return null;
  }
}

// ── Spot token index cache ────────────────────────────────────────────────────
// Phase 6.1 / P0-02 / F-01
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
// Checked: 2026-06-15. Spot assets use asset = 10000 + spotMeta.universe[index].
// This is a SEPARATE index space from the perp universe — getCoinIndex() is NOT reusable.
const _spotIndexCache: Map<string, number> = new Map();

async function ensureSpotTokenIndex(coin: string): Promise<number> {
  const key = coin.toUpperCase();
  const cached = _spotIndexCache.get(key);
  if (cached !== undefined) return cached;

  const res = await fetchWithTimeout(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'spotMeta' }),
  });
  if (!res.ok) throw new Error(`spotMeta fetch failed: HTTP ${res.status}`);
  const meta = await res.json();

  // spotMeta.universe is an array of token objects: { name, tokens, ... }
  // asset index = 10000 + position in universe array
  const universe: Array<{ name: string; tokens: number[] }> = meta.universe ?? [];
  universe.forEach((pair, i) => {
    // Map each universe entry by its name (e.g. "PURR/USDC" → 10000+0)
    // Also map the base token name for convenience (e.g. "PURR" → 10000+0)
    _spotIndexCache.set(pair.name.toUpperCase(), 10000 + i);
    const baseName = pair.name.split('/')[0];
    if (baseName) _spotIndexCache.set(baseName.toUpperCase(), 10000 + i);
  });

  const result = _spotIndexCache.get(key);
  if (result === undefined) throw new Error(`Spot token not found in spotMeta: ${coin}`);
  return result;
}

// ── placeSpotOrder ────────────────────────────────────────────────────────────
// Phase 6.1 / P0-02 / F-01
// Uses same /exchange endpoint and type:'order' action as placeMarketOrder.
// The only difference is a = 10000 + spotIndex instead of perpIndex.
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
// Checked: 2026-06-15.
export async function placeSpotOrder(params: {
  coin:    string;
  isBuy:   boolean;
  sz:      number;
  px:      number;
  address: string;
  signer:  import('ethers').Signer;
  tif?:    OrderTif;
}): Promise<{ success: boolean; orderId?: string; error?: string; filledAsMaker?: boolean }> {
  try {
    const tokenIndex = await ensureSpotTokenIndex(params.coin);
    const tif: OrderTif = params.tif ?? 'Alo';
    const szDecimals    = getCoinSzDecimals(params.coin);
    const nonce         = Date.now();

    const action = {
      type: 'order',
      orders: [{
        a: tokenIndex,
        b: params.isBuy,
        p: formatPx(params.px),
        s: formatSz(params.sz, szDecimals),
        r: false,
        t: { limit: { tif } },
      }],
      grouping: 'na',
    };

    const { r, s, v } = await signHyperliquidAction(params.signer, action, nonce, null);

    const res = await fetchWithTimeout(`${HL_REST_URL}/exchange`,  {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, nonce, signature: { r, s, v }, vaultAddress: null }),
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };

    const data = await res.json();
    if (data.status === 'ok') {
      const status      = data.response?.data?.statuses?.[0];
      if (status?.error) return { success: false, error: status.error };
      const orderId     = (status?.resting?.oid ?? status?.filled?.oid)?.toString();
      const filledAsMaker = !!status?.resting;
      return { success: true, orderId, filledAsMaker };
    }
    return { success: false, error: data.response?.data?.statuses?.[0]?.error ?? data.error ?? JSON.stringify(data) };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
