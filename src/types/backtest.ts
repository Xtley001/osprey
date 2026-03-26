export interface StrategyParams {
  entryRateThreshold: number;   // % e.g. 0.04
  exitRateThreshold: number;    // % e.g. 0.02
  minHoursElevated: number;     // e.g. 2
  maxHoldHours: number;         // e.g. 72
  capitalUSDC: number;
  rebalanceThreshold: number;   // % drift e.g. 5
  takerFee: number;             // % e.g. 0.035
  makerFee: number;             // % e.g. 0.01
}

export interface BacktestParams {
  symbol: string;
  startDate: Date;
  endDate: Date;
  strategy: StrategyParams;
  initialCapital: number;
  strategyType: 'SINGLE_PAIR' | 'ROTATION';
}

export interface TradeRecord {
  id: string;
  symbol: string;
  entryTime: number;
  exitTime: number;
  hoursHeld: number;
  entryRate: number;
  avgRate: number;
  grossFunding: number;
  fees: number;
  net: number;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalFundingEarned: number;
  totalFeesPaid: number;
  netProfit: number;
  winRate: number;
  avgHoldHours: number;
  sharpeRatio: number;
  maxDrawdown: number;
  numTrades: number;
  bestTrade: number;
  worstTrade: number;
  annualizedYield: number;
}

export interface BacktestResult {
  trades: TradeRecord[];
  equityCurve: { timestamp: number; equity: number }[];
  metrics: BacktestMetrics;
  params: BacktestParams;
  runAt: number;
}
