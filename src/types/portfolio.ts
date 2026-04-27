/**
 * Portfolio-level types for multi-pair harvest engine.
 */

export interface PortfolioSummary {
  totalCapital:      number;
  capitalDeployed:   number;
  deploymentPct:     number;
  activePositions:   number;
  earningPerHour:    number;
  earningPerDay:     number;
  allTimeNet:        number;
  inceptionDays:     number;
  liveAPY:           number;
  simpleAPY:         number;
}

export interface PortfolioMetrics {
  summary:           PortfolioSummary;
  topPairs:          PairSummary[];
  regimeLabel:       'HOT' | 'NEUTRAL' | 'COLD';
  avgRateHr:         number;
  breadthPct:        number;    // % of top-20 pairs with positive funding
}

export interface PairSummary {
  symbol:        string;
  rateHr:        number;
  perpNotional:  number;
  earningPerHr:  number;
  hoursHeld:     number;
  netPnL:        number;
  tier:          'sub' | 'core' | 'elevated' | 'hot';
}

export interface WalletType {
  address:    string | null;
  connected:  boolean;
  balance:    number;
  method:     'injected' | 'walletconnect' | 'agentKey' | 'none';
}
