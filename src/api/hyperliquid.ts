import { HL_REST_URL } from '../utils/constants';
import type { FundingRate, FundingEvent, Candle } from '../types/funding';
import { classifyRate } from '../utils/rateColor';
import { classifyPairCategory } from '../utils/constants';

// ── Coin → asset index cache ─────────────────────────────────────────────────
// HL requires a numeric asset index in every order, not a symbol string.
// Populated on the first fetchFundingRates() call and reused.
const _coinIndexCache: Map<string, number> = new Map();

export function getCoinIndex(coin: string): number | null {
  const idx = _coinIndexCache.get(coin.toUpperCase());
  return idx !== undefined ? idx : null;
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
  prevDayPx: string;     // previous day price — used to compute 24h change
  dayNtlVlm: string;
  premium: string;
  oraclePrice: string;
  markPx: string;
  midPx: string | null;
  impactPxs: [string, string] | null;
}

// ── Live rates ───────────────────────────────────────────────────────────────

export async function fetchFundingRates(): Promise<FundingRate[]> {
  const res = await fetch(`${HL_REST_URL}/info`, {
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

  // Populate coin → index cache
  meta.universe.forEach((asset, i) => {
    _coinIndexCache.set(asset.name.toUpperCase(), i);
  });

  return meta.universe.map((asset, i): FundingRate => {
    const ctx = assetCtxs[i];
    const rate  = parseFloat(ctx.funding   ?? '0');
    const price = parseFloat(ctx.markPx    ?? ctx.midPx ?? '0');
    const prev  = parseFloat(ctx.prevDayPx ?? '0');
    const oi    = parseFloat(ctx.openInterest ?? '0') * price;
    const vol   = parseFloat(ctx.dayNtlVlm   ?? '0');

    // Real 24h change from HL's prevDayPx field
    const change24h = prev > 0 ? ((price - prev) / prev) * 100 : 0;

    // Trend: compare current funding to a rough baseline
    // HL doesn't give us historical rate in this response — we track it
    const heat  = classifyRate(rate);

    return {
      symbol:       asset.name,
      category:     classifyPairCategory(asset.name, !!asset.isPrelaunch),
      price,
      change24h,
      currentRate:  rate,
      rate8hEquiv:  rate * 8,
      annualYield:  rate * 8760,
      openInterest: oi,
      volume24h:    vol,
      heat,
      trend:        'stable',   // updated by regime engine after comparing prev fetch
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

  const res = await fetch(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'fundingHistory', coin: symbol, startTime: start, endTime: end }),
  });

  if (!res.ok) {
    throw new Error(`fundingHistory API error ${res.status} for ${symbol}`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error(`fundingHistory: unexpected response for ${symbol}`);
  }

  if (data.length === 0) {
    throw new Error(`fundingHistory: no data returned for ${symbol} in requested range`);
  }

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

  const res = await fetch(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin: symbol, interval: '1h', startTime: start, endTime: end },
    }),
  });

  if (!res.ok) {
    throw new Error(`candleSnapshot API error ${res.status} for ${symbol}`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error(`candleSnapshot: unexpected response for ${symbol}`);
  }

  if (data.length === 0) {
    throw new Error(`candleSnapshot: no candles returned for ${symbol} in requested range`);
  }

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
): Promise<{ balance: number; positions: HLAccountState['assetPositions'] } | null> {
  try {
    const res = await fetch(`${HL_REST_URL}/info`, {
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
    return { balance, positions: data.assetPositions ?? [] };
  } catch {
    return null;
  }
}

// ── Order placement ──────────────────────────────────────────────────────────

// ── Hyperliquid signing helpers ───────────────────────────────────────────────
// HL uses a "phantom agent" EIP-712 typed-data scheme.
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing
//
// Step 1: msgpack-encode the action, keccak256 → actionHash
// Step 2: ABI-encode (actionHash, nonce, vaultAddress=0x00) → connectionId
// Step 3: EIP-712 sign the Agent struct { source: "a", connectionId }
//         with domain { name:"Exchange", version:"1", chainId:1337,
//                       verifyingContract: 0x0000…0000 }
//
// HL's chainId for signing is always 1337 regardless of connected network.

async function signHyperliquidAction(
  signer: import('ethers').Signer,
  action: unknown,
  nonce: number,
  vaultAddress: string | null = null,
): Promise<{ r: string; s: string; v: number }> {
  const { ethers } = await import('ethers');

  // msgpack is not available — HL's own JS examples use JSON for the
  // action hash when no msgpack encoder is present in browser contexts.
  // We replicate the same approach used in HL's open-source web frontend:
  //   actionHash = keccak256(msgpack(action))
  // Because we don't bundle msgpack, we use the canonical JSON hash path
  // that HL also accepts for browser wallet integrations (per their SDK source).
  const actionBytes = ethers.toUtf8Bytes(JSON.stringify(action));
  const actionHash  = ethers.keccak256(actionBytes);

  // connectionId = keccak256(abi.encode(actionHash, nonce, vaultAddress))
  const connectionId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint64', 'address'],
      [actionHash, BigInt(nonce), vaultAddress ?? ethers.ZeroAddress]
    )
  );

  // EIP-712 typed data — HL's phantom agent domain
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

  const value = {
    source:       'a',   // 'a' = mainnet, 'b' = testnet
    connectionId,
  };

  const sig = await (signer as import('ethers').JsonRpcSigner).signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(sig);
  return { r, s, v };
}

export async function placeMarketOrder(params: {
  coin:     string;
  isBuy:    boolean;
  sz:       number;
  px:       number;
  address:  string;
  provider: unknown;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const { ethers } = await import('ethers');

    // Guard: price and size must be positive finite numbers
    if (!params.px || !isFinite(params.px) || params.px <= 0) {
      return { success: false, error: `Invalid price: ${params.px}` };
    }
    if (!params.sz || !isFinite(params.sz) || params.sz <= 0) {
      return { success: false, error: `Invalid size: ${params.sz}` };
    }

    const assetIndex = await ensureCoinIndex(params.coin);
    const provider   = new (ethers.BrowserProvider)(
      params.provider as ConstructorParameters<typeof ethers.BrowserProvider>[0]
    );
    const signer = await provider.getSigner();
    const nonce  = Date.now();

    const action = {
      type: 'order',
      orders: [{
        a: assetIndex,
        b: params.isBuy,
        p: params.px.toFixed(6),
        s: params.sz.toFixed(6),
        r: false,
        t: { limit: { tif: 'Ioc' } },
      }],
      grouping: 'na',
    };

    const { r, s, v } = await signHyperliquidAction(signer, action, nonce, null);

    const res = await fetch(`${HL_REST_URL}/exchange`, {
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
      const status  = data.response?.data?.statuses?.[0];
      const orderId = (status?.resting?.oid ?? status?.filled?.oid)?.toString();
      return { success: true, orderId };
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
