/**
 * Regime Detection — updated thresholds to match three-tier system.
 *
 * Previous thresholds created a boundary conflict:
 *   Entry threshold (0.04%/hr) == HOT regime boundary
 *   → System always entered when already HOT (too late into the episode)
 *
 * New regime labels align with the corrected tier system.
 */

import type { FundingRate } from '../types/funding';
import type { RegimeState } from '../types/account';
import { RATE_TIERS } from '../utils/constants';

export function detectRegime(
  allRates: FundingRate[],
  prevAvg = 0,
): { regime: RegimeState; nextPrevAvg: number } {
  const top20 = [...allRates]
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, 20);

  if (top20.length === 0) {
    return {
      regime: { label: 'NEUTRAL', marketAvgRate: 0, breadth: 0, trend: 'stable', hoursInRegime: 0, confidence: 0 },
      nextPrevAvg: 0,
    };
  }

  const marketAvgRate = top20.reduce((s, p) => s + p.currentRate, 0) / top20.length;

  // UPDATED: breadth is % of top-20 with rate above CORE threshold (not 0.02%/hr)
  const breadth = top20.filter(p => p.currentRate > RATE_TIERS.core).length / top20.length;

  const trend = marketAvgRate > prevAvg * 1.05 ? 'rising'
              : marketAvgRate < prevAvg * 0.80  ? 'falling'
              : 'stable';

  // Regime labels — aligned with rate tier system
  // HOT:     avg rate > 0.05%/hr  (hot tier)
  // NEUTRAL: avg rate > 0.01%/hr  (core threshold — harvest is active)
  // COLD:    avg rate <= 0.01%/hr (below core threshold — pause entries)
  // Use RATE_TIERS.core (0.0001) as the COLD/NEUTRAL boundary so that
  // "floor-of-consideration" rates (subThreshold = 0.00005) correctly stay COLD.
  const label = marketAvgRate > RATE_TIERS.hot  ? 'HOT'
              : marketAvgRate > RATE_TIERS.core  ? 'NEUTRAL'
              : 'COLD';

  const stdDev = Math.sqrt(
    top20.reduce((s, p) => s + (p.currentRate - marketAvgRate) ** 2, 0) / top20.length
  );
  const confidence = Math.min(100, Math.round(100 - (stdDev / (marketAvgRate + 0.0001)) * 50));

  return {
    regime: { label, marketAvgRate, breadth, trend, hoursInRegime: 1, confidence },
    nextPrevAvg: marketAvgRate,
  };
}

export function shouldRotate(
  currentRate:  number,
  bestRate:     number,
  notional:     number,
  takerFee:     number,
  minAdvantage = 0.00005,   // updated from 0.0002 to match new tier system
  maxBreakEven = 3
): { rotate: boolean; breakEvenHours: number; gain: number } {
  const rateDiff       = bestRate - currentRate;
  const rotationCost   = notional * takerFee * 2;
  const breakEvenHours = rateDiff > 0 ? rotationCost / (rateDiff * notional) : Infinity;
  const rotate         = rateDiff > minAdvantage && breakEvenHours < maxBreakEven;
  const gain           = rotate ? (rateDiff * notional * 24) - rotationCost : 0;
  return { rotate, breakEvenHours, gain };
}
