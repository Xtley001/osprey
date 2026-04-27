// funding.ts
export type RateHeat = 'cold' | 'warm' | 'hot' | 'fire';

/**
 * Categories matching Hyperliquid's own UI groupings.
 * - Crypto:     standard crypto perpetuals (BTC, ETH, SOL, DOGE, etc.)
 * - TradFi:     stocks, ETFs, commodities, private companies (NVDA, GOLD, SPACEX, etc.)
 * - HIP-3:      community-deployed perpetuals with custom fee structure
 * - Pre-launch: pairs in Dutch auction phase, not yet standard perps
 * - All:        filter-only sentinel — never assigned to a pair
 */
export type Category = 'All' | 'Crypto' | 'TradFi' | 'HIP-3' | 'Pre-launch';
export type SortKey = 'rate' | 'oi' | 'volume' | 'annualYield';

export interface FundingRate {
  symbol: string;
  category: Exclude<Category, 'All'>;
  price: number;
  change24h: number;
  currentRate: number;      // hourly % as decimal (0.0007 = 0.07%/hr)
  rate8hEquiv: number;      // 8h equivalent %
  annualYield: number;      // annualized % as decimal
  openInterest: number;     // USDC notional
  volume24h: number;        // USDC
  heat: RateHeat;
  trend: 'rising' | 'falling' | 'stable';
}

export interface FundingEvent {
  timestamp: number;
  rate: number;
  symbol: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
