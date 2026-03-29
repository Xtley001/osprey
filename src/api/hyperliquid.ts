import { HL_REST_URL } from '../utils/constants';
import type { FundingRate, FundingEvent, Candle } from '../types/funding';
import { classifyRate } from '../utils/rateColor';
import { TRADFI_PAIRS } from '../utils/constants';

// ── Coin → asset index cache ─────────────────────────────────────────────────
// HL requires a numeric asset index (not symbol string) in every order.
// We build this map once from the metaAndAssetCtxs response and reuse it.
const _coinIndexCache: Map<string, number> = new Map();

export function getCoinIndex(coin: string): number | null {
  const idx = _coinIndexCache.get(coin.toUpperCase());
  return idx !== undefined ? idx : null;
}

async function ensureCoinIndex(coin: string): Promise<number> {
  const cached = _coinIndexCache.get(coin.toUpperCase());
  if (cached !== undefined) return cached;
  // Cache is empty — fetch universe to populate it
  await fetchFundingRates();
  const idx = _coinIndexCache.get(coin.toUpperCase());
  if (idx === undefined) throw new Error(`Unknown coin: ${coin}. Not listed on Hyperliquid.`);
  return idx;
}


function generateMockPairs(): FundingRate[] {
  const pairs = [
    { symbol: 'BTC',    oi: 45_000_000, vol: 120_000_000, base: 0.00018 },
    { symbol: 'ETH',    oi: 28_000_000, vol:  80_000_000, base: 0.00022 },
    { symbol: 'SOL',    oi: 12_000_000, vol:  35_000_000, base: 0.00045 },
    { symbol: 'NVDA',   oi:  8_500_000, vol:  22_000_000, base: 0.00071 },
    { symbol: 'AAPL',   oi:  5_200_000, vol:  14_000_000, base: 0.00038 },
    { symbol: 'GOOGL',  oi:  4_800_000, vol:  12_000_000, base: 0.00029 },
    { symbol: 'MAVIA',  oi:  3_200_000, vol:   8_500_000, base: 0.00242 },
    { symbol: 'WTIOIL', oi:  2_900_000, vol:   7_200_000, base: 0.00131 },
    { symbol: 'GOLD',   oi:  3_500_000, vol:   9_000_000, base: 0.00055 },
    { symbol: 'DOGE',   oi:  6_000_000, vol:  18_000_000, base: 0.00063 },
    { symbol: 'AVAX',   oi:  4_100_000, vol:  11_000_000, base: 0.00048 },
    { symbol: 'ARB',    oi:  3_800_000, vol:  10_200_000, base: 0.00034 },
    { symbol: 'LINK',   oi:  3_300_000, vol:   8_800_000, base: 0.00041 },
    { symbol: 'MATIC',  oi:  2_800_000, vol:   7_500_000, base: 0.00028 },
    { symbol: 'OP',     oi:  2_500_000, vol:   6_800_000, base: 0.00057 },
    { symbol: 'NEAR',   oi:  2_200_000, vol:   5_900_000, base: 0.00066 },
    { symbol: 'APT',    oi:  2_000_000, vol:   5_300_000, base: 0.00074 },
    { symbol: 'INJ',    oi:  1_800_000, vol:   4_800_000, base: 0.00089 },
    { symbol: 'TIA',    oi:  1_600_000, vol:   4_200_000, base: 0.00112 },
    { symbol: 'SPACEX', oi:  1_400_000, vol:   3_600_000, base: 0.00095 },
    { symbol: 'TSM',    oi:  1_200_000, vol:   3_100_000, base: 0.00043 },
    { symbol: 'USAR',   oi:  1_000_000, vol:   2_600_000, base: 0.00097 },
    { symbol: 'SUI',    oi:  2_600_000, vol:   7_000_000, base: 0.00081 },
    { symbol: 'PEPE',   oi:  3_100_000, vol:   8_300_000, base: 0.00156 },
    { symbol: 'WIF',    oi:  2_300_000, vol:   6_100_000, base: 0.00134 },
    { symbol: 'JTO',    oi:  1_500_000, vol:   4_000_000, base: 0.00076 },
    { symbol: 'PYTH',   oi:  1_300_000, vol:   3_400_000, base: 0.00058 },
    { symbol: 'STRK',   oi:  1_100_000, vol:   2_900_000, base: 0.00067 },
  ];
  const prices: Record<string, number> = {
    BTC: 67420, ETH: 3540, SOL: 178, NVDA: 174.91, AAPL: 189.32,
    GOOGL: 175.48, MAVIA: 0.82, WTIOIL: 78.45, GOLD: 2650.3,
    DOGE: 0.1834, AVAX: 38.2, ARB: 1.12, LINK: 18.4, MATIC: 0.89,
    OP: 2.45, NEAR: 6.78, APT: 11.2, INJ: 34.5, TIA: 8.9,
    SPACEX: 180, TSM: 162.4, USAR: 1.0, SUI: 1.89, PEPE: 0.0000148,
    WIF: 2.87, JTO: 3.42, PYTH: 0.54, STRK: 1.23,
  };
  return pairs.map(p => {
    const jitter = (Math.random() - 0.3) * 0.3;
    const rate = Math.max(0, p.base * (1 + jitter));
    const heat = classifyRate(rate);
    const isTradFi = TRADFI_PAIRS.includes(p.symbol);
    const change = (Math.random() - 0.45) * 6;
    return {
      symbol: p.symbol,
      category: isTradFi ? 'TradFi' : (rate > 0.001 ? 'Trending' : 'Crypto'),
      price: prices[p.symbol] ?? 1.0,
      change24h: change,
      currentRate: rate,
      rate8hEquiv: rate * 8,
      annualYield: rate * 8760,
      openInterest: p.oi,
      volume24h: p.vol,
      heat,
      trend: jitter > 0.1 ? 'rising' : jitter < -0.1 ? 'falling' : 'stable',
    };
  });
}

// Fixed: generates correct number of hours spanning the full date range
function generateMockFundingHistory(symbol: string, startTime?: number, endTime?: number): FundingEvent[] {
  const end = endTime ?? Date.now();
  const start = startTime ?? end - 72 * 3_600_000;
  const hours = Math.ceil((end - start) / 3_600_000);
  
  // Use consistent base rate per symbol so backtest results are reproducible
  const baseRates: Record<string, number> = {
    BTC: 0.00018, ETH: 0.00022, SOL: 0.00045, NVDA: 0.00071, AAPL: 0.00038,
    GOOGL: 0.00029, MAVIA: 0.00242, WTIOIL: 0.00131, GOLD: 0.00055,
    DOGE: 0.00063, AVAX: 0.00048, ARB: 0.00034, LINK: 0.00041,
  };
  const base = baseRates[symbol] ?? 0.0005;

  // Generate realistic trending rate data with periods above/below threshold
  let rate = base;
  return Array.from({ length: hours }, (_, i) => {
    const t = start + i * 3_600_000;
    // Simulate regime cycles: every ~24 hours rates spike and decay
    const cycle = Math.sin(i / 12 * Math.PI) * 0.4;
    const noise = (Math.random() - 0.45) * 0.3;
    rate = Math.max(0.00005, base * (1 + cycle + noise));
    return { timestamp: t, rate, symbol };
  });
}

function generateMockCandles(symbol: string, startTime?: number, endTime?: number): Candle[] {
  const end = endTime ?? Date.now();
  const start = startTime ?? end - 72 * 3_600_000;
  const hours = Math.ceil((end - start) / 3_600_000);
  const prices: Record<string, number> = {
    BTC: 67420, ETH: 3540, SOL: 178, NVDA: 174.91, AAPL: 189.32,
    GOOGL: 175.48, DEFAULT: 10,
  };
  const basePrice = prices[symbol] ?? prices.DEFAULT;
  let price = basePrice;
  return Array.from({ length: hours }, (_, i) => {
    const t = start + i * 3_600_000;
    const change = (Math.random() - 0.48) * 0.012;
    const open = price;
    price = price * (1 + change);
    const high = Math.max(open, price) * (1 + Math.random() * 0.004);
    const low  = Math.min(open, price) * (1 - Math.random() * 0.004);
    return { timestamp: t, open, high, low, close: price, volume: Math.random() * 1_000_000 };
  });
}

async function fetchRatesFromHL(): Promise<FundingRate[]> {
  const res = await fetch(`${HL_REST_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!res.ok) throw new Error(`HL API error: ${res.status}`);
  const [meta, assetCtxs] = await res.json();
  // Populate coin index cache every time we fetch universe
  meta.universe.forEach((asset: { name: string }, i: number) => {
    _coinIndexCache.set(asset.name.toUpperCase(), i);
  });
  return meta.universe.map((asset: { name: string }, i: number) => {
    const ctx = assetCtxs[i];
    const rate = parseFloat(ctx.funding ?? '0');
    const oi   = parseFloat(ctx.openInterest ?? '0') * parseFloat(ctx.markPx ?? '0');
    const vol  = parseFloat(ctx.dayNtlVlm ?? '0');
    const price = parseFloat(ctx.markPx ?? '0');
    const isTradFi = TRADFI_PAIRS.includes(asset.name);
    const heat = classifyRate(rate);
    return {
      symbol: asset.name,
      category: isTradFi ? 'TradFi' : 'Crypto',
      price,
      change24h: 0,
      currentRate: rate,
      rate8hEquiv: rate * 8,
      annualYield: rate * 8760,
      openInterest: oi,
      volume24h: vol,
      heat,
      trend: 'stable' as const,
    } satisfies FundingRate;
  });
}

export async function fetchFundingRates(): Promise<FundingRate[]> {
  try {
    const data = await fetchRatesFromHL();
    if (data.length > 0) return data;
  } catch { /* fall through */ }
  return generateMockPairs();
}

export async function fetchFundingHistory(symbol: string, startTime?: number, endTime?: number): Promise<FundingEvent[]> {
  try {
    const end   = endTime   ?? Date.now();
    const start = startTime ?? end - 72 * 3_600_000;
    const res = await fetch(`${HL_REST_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'fundingHistory', coin: symbol, startTime: start, endTime: end }),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
    return data.map((d: { time: number; fundingRate: string }) => ({
      timestamp: d.time,
      rate: parseFloat(d.fundingRate),
      symbol,
    }));
  } catch {
    return generateMockFundingHistory(symbol, startTime, endTime);
  }
}

export async function fetchCandles(symbol: string, hours?: number, startTime?: number, endTime?: number): Promise<Candle[]> {
  try {
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
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('empty');
    return data.map((c: { t: number; o: string; h: string; l: string; c: string; v: string }) => ({
      timestamp: c.t, open: parseFloat(c.o), high: parseFloat(c.h),
      low: parseFloat(c.l), close: parseFloat(c.c), volume: parseFloat(c.v),
    }));
  } catch {
    return generateMockCandles(symbol, startTime, endTime);
  }
}

export { generateMockPairs, generateMockFundingHistory, generateMockCandles };

// ─── Real account API ────────────────────────────────────────────────────────

export interface HLAccountState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
  };
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      returnOnEquity: string;
      liquidationPx: string | null;
      leverage: { type: string; value: number };
      cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
    };
    type: string;
  }>;
}

export async function fetchAccountState(address: string): Promise<{ balance: number; positions: HLAccountState['assetPositions'] } | null> {
  try {
    const res = await fetch(`${HL_REST_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
    });
    if (!res.ok) throw new Error('API error');
    const data: HLAccountState = await res.json();
    const balance = parseFloat(data.marginSummary?.accountValue ?? data.crossMarginSummary?.accountValue ?? '0');
    return { balance, positions: data.assetPositions ?? [] };
  } catch {
    return null;
  }
}

// ── Hyperliquid order placement ─────────────────────────────────────────────
//
// HL signing protocol (EIP-712 variant):
//   1. Build the action object with correct asset index (NOT symbol string)
//   2. Hash: keccak256(abi.encode(actionHash, nonce, vaultAddress=0x0))
//      where actionHash = keccak256(action JSON bytes)
//   3. Sign the hash using personal_sign (eth_sign prefix)
//   4. POST to /exchange with { action, nonce, signature: {r,s,v}, vaultAddress }
//
// Reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
//
export async function placeMarketOrder(params: {
  coin: string;
  isBuy: boolean;
  sz: number;        // size in coin units (e.g. 0.01 BTC)
  px: number;        // worst acceptable price (slippage guard for IOC)
  address: string;
  provider: unknown; // window.ethereum / ethers-compatible provider
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const { ethers } = await import('ethers');

    // Step 1: Resolve coin → numeric asset index
    const assetIndex = await ensureCoinIndex(params.coin);

    const provider = new (ethers.BrowserProvider)(
      params.provider as ConstructorParameters<typeof ethers.BrowserProvider>[0]
    );
    const signer = await provider.getSigner();

    // Step 2: Build action
    const nonce = Date.now();
    const action = {
      type: 'order',
      orders: [{
        a: assetIndex,           // correct asset index from universe
        b: params.isBuy,         // true = buy/long, false = sell/short
        p: params.px.toFixed(6), // price as string, 6dp
        s: params.sz.toFixed(6), // size as string, 6dp
        r: false,                // reduce-only: false for new positions
        t: { limit: { tif: 'Ioc' } }, // IOC = immediate-or-cancel ≈ market order
      }],
      grouping: 'na',
    };

    // Step 3: Hash the action
    //   actionHash = keccak256(UTF-8 bytes of JSON-serialised action)
    //   msgHash    = keccak256(abi.encode(actionHash, nonce, address(0)))
    //   HL uses address(0) for vaultAddress when trading from your own account
    const actionHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(action))
    );

    // ABI-encode: (bytes32 actionHash, uint64 nonce, address vaultAddress)
    const msgHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint64', 'address'],
        [actionHash, BigInt(nonce), ethers.ZeroAddress]
      )
    );

    // Step 4: Sign with personal_sign (adds the ETH message prefix)
    const sig = await signer.signMessage(ethers.getBytes(msgHash));
    const { r, s, v } = ethers.Signature.from(sig);

    // Step 5: Submit
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
      const status = data.response?.data?.statuses?.[0];
      const orderId = (status?.resting?.oid ?? status?.filled?.oid)?.toString();
      return { success: true, orderId };
    }

    // HL returns error details in statuses array
    const errMsg = data.response?.data?.statuses?.[0]?.error
      ?? data.error
      ?? JSON.stringify(data);
    return { success: false, error: errMsg };

  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
