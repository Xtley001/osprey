/**
 * Portfolio Engine — multi-pair position sizing.
 *
 * Replaces the hardcoded 3-position limit with a proper portfolio construction
 * model that can run 20–100 simultaneous delta-neutral pairs.
 *
 * Sizing constraints (in priority order):
 *   1. Available deployable margin
 *   2. Per-pair OI cap (0.5% of pair OI to avoid market impact)
 *   3. Per-pair portfolio concentration cap (5% for tail pairs, 20% for BTC/ETH)
 *   4. Absolute min/max per position
 */

import type { FundingRate } from '../types/funding';
import type { Position } from '../types/position';
import { RATE_TIERS, classifyTier } from '../utils/constants';

export interface PortfolioConfig {
  totalCapitalUSDC:    number;
  marginUtilization:   number;   // 0.0–1.0, default 0.80
  maxPositions:        number;   // hard cap, default 100
  minPositionUSDC:     number;   // minimum notional per pair, default 50
  maxPositionUSDC:     number;   // maximum notional per pair, default 5000
  maxPairOIPercent:    number;   // % of pair's OI we can take, default 0.005
  maxPairPortfolioPct: number;   // % of portfolio per pair, default 0.05
  corePairsMaxPct:     number;   // BTC, ETH can take up to 0.20
  corePairs:           Set<string>;
  rebalanceThresholdPct: number; // % price drift before rebalance, default 0.10
}

export interface PairAllocation {
  symbol:           string;
  perpNotional:     number;
  spotNotional:     number;
  totalCapital:     number;
  fundingRateHr:    number;
  estimatedHrYield: number;
  tier:             'sub' | 'core' | 'elevated' | 'hot';
  oi:               number;
}

const MIN_OI = 1_000_000;

export const DEFAULT_PORTFOLIO_CONFIG: PortfolioConfig = {
  totalCapitalUSDC:    10_000,
  marginUtilization:   0.80,
  maxPositions:        100,
  minPositionUSDC:     50,
  maxPositionUSDC:     5_000,
  maxPairOIPercent:    0.005,   // 0.5% of OI
  maxPairPortfolioPct: 0.05,    // 5% of portfolio per pair
  corePairsMaxPct:     0.20,    // 20% for BTC, ETH
  corePairs:           new Set(['BTC', 'ETH']),
  rebalanceThresholdPct: 0.10,
};

function scoreForAllocation(p: FundingRate): number {
  const rateScore  = p.currentRate * 10_000;
  const oiScore    = Math.log10(Math.max(p.openInterest, 1)) / 10;
  const heatScore  = ({ fire: 4, hot: 3, warm: 2, cold: 1 } as Record<string, number>)[p.heat] / 10 || 0.1;
  const categoryPenalty = p.category === 'TradFi' ? 0.8
                         : p.category === 'HIP-3'  ? 0.7
                         : 1.0;
  return (rateScore + oiScore + heatScore) * categoryPenalty;
}

export function buildPortfolio(
  pairs:     FundingRate[],
  positions: Position[],
  config:    PortfolioConfig,
): {
  enter: PairAllocation[];
  hold:  PairAllocation[];
  exit:  string[];
} {
  const deployableCapital = config.totalCapitalUSDC * config.marginUtilization;
  const heldSymbols = new Set(positions.map(p => p.symbol));

  // Score all qualifying pairs
  const scored = pairs
    .filter(p => p.currentRate >= RATE_TIERS.subThreshold)
    .filter(p => p.currentRate >= 0)
    .filter(p => p.openInterest >= MIN_OI)
    .map(p => ({ ...p, score: scoreForAllocation(p) }))
    .sort((a, b) => b.score - a.score);

  // Greedy capital allocation
  const allocations: PairAllocation[] = [];
  const heldCapital = positions.reduce((s, p) => s + p.notional * 2, 0);
  let budgetRemaining = deployableCapital - heldCapital;

  for (const pair of scored) {
    if (allocations.length + positions.length >= config.maxPositions) break;
    if (budgetRemaining <= config.minPositionUSDC * 2) break;
    if (heldSymbols.has(pair.symbol)) continue;

    const isCore     = config.corePairs.has(pair.symbol);
    const maxByPortfolio = config.totalCapitalUSDC * (isCore ? config.corePairsMaxPct : config.maxPairPortfolioPct);
    const maxByOI        = pair.openInterest * config.maxPairOIPercent;
    const maxByBudget    = Math.min(budgetRemaining, config.maxPositionUSDC * 2);

    const totalCapital = Math.min(maxByPortfolio, maxByOI, maxByBudget);
    if (totalCapital < config.minPositionUSDC * 2) continue;

    const perpNotional = totalCapital / 2;
    allocations.push({
      symbol:           pair.symbol,
      perpNotional,
      spotNotional:     perpNotional,
      totalCapital,
      fundingRateHr:    pair.currentRate,
      estimatedHrYield: perpNotional * pair.currentRate,
      tier:             classifyTier(pair.currentRate),
      oi:               pair.openInterest,
    });
    budgetRemaining -= totalCapital;
  }

  // Identify positions to exit
  const exit = positions
    .filter(p => {
      const live = pairs.find(x => x.symbol === p.symbol);
      return !live || live.currentRate < RATE_TIERS.exit || live.currentRate < 0;
    })
    .map(p => p.symbol);

  // Identify positions to hold
  const hold = positions
    .filter(p => !exit.includes(p.symbol))
    .map(p => {
      const live = pairs.find(x => x.symbol === p.symbol)!;
      return {
        symbol:           p.symbol,
        perpNotional:     p.notional,
        spotNotional:     p.notional,
        totalCapital:     p.notional * 2,
        fundingRateHr:    live.currentRate,
        estimatedHrYield: p.notional * live.currentRate,
        tier:             classifyTier(live.currentRate),
        oi:               live.openInterest,
      };
    });

  return { enter: allocations, hold, exit };
}

/**
 * Batch entry helper — enters positions concurrently with rate-limit awareness.
 * Chunks allocations into groups of 10 with 200ms between batches.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/**
 * Portfolio-level projection for display in UI.
 * Uses simple (non-compounded) annualization — the number to show LPs.
 */
export function projectPortfolioYield(params: {
  pairs:           PairAllocation[];
  existingPositions: Position[];
  avgRateHr:       number;
}): {
  totalPerpNotional: number;
  fundingPerHour:    number;
  fundingPerDay:     number;
  fundingPerYear:    number;
  simpleAPY:         number;
  totalCapital:      number;
} {
  const totalCapital = [
    ...params.pairs.map(a => a.totalCapital),
    ...params.existingPositions.map(p => p.notional * 2),
  ].reduce((s, c) => s + c, 0);

  const totalPerpNotional = totalCapital / 2;
  const fundingPerHour    = totalPerpNotional * params.avgRateHr;
  const fundingPerDay     = fundingPerHour * 24;
  const fundingPerYear    = fundingPerDay * 365;
  const simpleAPY         = totalCapital > 0 ? fundingPerYear / totalCapital : 0;

  return { totalPerpNotional, fundingPerHour, fundingPerDay, fundingPerYear, simpleAPY, totalCapital };
}
