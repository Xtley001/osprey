export interface Position {
  id: string;
  symbol: string;
  entryTime: number;
  entryPrice: number;
  entryRate: number;
  notional: number;       // USDC (each leg)
  fundingEarned: number;  // USDC cumulative
  feesPaid: number;
  currentPrice: number;
  currentRate: number;
  hedgeDrift: number;     // %
  hoursHeld: number;
  isDemo: boolean;
}

export interface Trade {
  id: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  hoursHeld: number;
  avgRate: number;
  grossFunding: number;
  fees: number;
  net: number;
  isDemo: boolean;
}

export interface PnLSummary {
  totalFundingEarned: number;
  totalFeesPaid: number;
  netProfit: number;
  bestPair: string;
  numTrades: number;
}
