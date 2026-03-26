// funding.ts
export type RateHeat = 'cold' | 'warm' | 'hot' | 'fire';
export type Category = 'All' | 'Crypto' | 'TradFi' | 'HIP-3' | 'Trending' | 'Pre-launch';
export type SortKey = 'rate' | 'oi' | 'volume' | 'annualYield';

export interface FundingRate {
  symbol: string;
  category: Exclude<Category, 'All'>;
  price: number;
  change24h: number;
  currentRate: number;      // hourly %
  rate8hEquiv: number;      // 8h equivalent %
  annualYield: number;      // annualized %
  openInterest: number;     // USDC
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
