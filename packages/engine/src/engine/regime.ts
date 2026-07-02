/**
 * Regime Detection — updated thresholds to match three-tier system.
 * shouldRotate fixed per CALC_AUDIT.md §4 (Bugs B1 + B2 resolved in harvestStore caller).
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

  // Breadth: % of top-20 with rate above CORE threshold
  const breadth = top20.filter(p => p.currentRate > RATE_TIERS.core).length / top20.length;

  const trend = marketAvgRate > prevAvg * 1.05 ? 'rising'
              : marketAvgRate < prevAvg * 0.80  ? 'falling'
              : 'stable';

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

/**
 * shouldRotate — determines if rotating from current pair to bestPair is worth the cost.
 *
 * @param roundTripFees — sum of all 4 leg fees: perpTaker + spotTaker + perpMaker + spotMaker.
 *   Computed by caller from useFeeStore. NOT a single-leg taker fee.
 *   See CALC_AUDIT.md §4.1 for the exact formula.
 *
 * Fixes Bug B1 (wrong fee param) and Bug B2 (wrong formula × 2) from CALC_AUDIT.md §14.
 */
export function shouldRotate(
  currentRate:       number,
  bestRate:          number,
  notional:          number,
  roundTripFees:     number,   // full round-trip fee fraction (all 4 legs summed)
  minAdvantage:      number,   // minimum rate gain required
  maxBreakEvenHours: number,   // Phase 2 default: 2.0h
): { rotate: boolean; breakEvenHours: number; gain: number } {
  const rateDiff       = bestRate - currentRate;
  // rotationCost uses × 1 because roundTripFees already covers all 4 legs
  // See CALC_AUDIT.md §4.3 — the old × 2 was wrong
  const rotationCost   = notional * roundTripFees;
  const breakEvenHours = rateDiff > 0 ? rotationCost / (rateDiff * notional) : Infinity;
  const rotate         = rateDiff > minAdvantage && breakEvenHours < maxBreakEvenHours;
  const gain           = rotate ? (rateDiff * notional * 24) - rotationCost : 0;
  return { rotate, breakEvenHours, gain };
}
