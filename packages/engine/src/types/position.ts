export interface Position {
  id: string;
  symbol: string;
  entryTime: number;
  entryPrice: number;
  entryRate: number;
  notional: number;       // USDC (each leg — perp notional = capital/2)
  fundingEarned: number;  // USDC cumulative (from HL API cumFunding.sinceOpen for live positions)
  feesPaid: number;
  currentPrice: number;
  currentRate: number;
  hedgeDrift: number;     // %
  hoursHeld: number;
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
}

export interface PnLSummary {
  totalFundingEarned: number;
  totalFeesPaid: number;
  netProfit: number;
  bestPair: string;
  numTrades: number;
}
