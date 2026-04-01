import type { FundingRate } from '../types/funding';
import type { RegimeState } from '../types/account';

/**
 * Detect the current funding rate regime.
 *
 * @param allRates   - Full list of current funding rates
 * @param prevAvg    - Market average from the previous call (for trend detection).
 *                     Callers should persist this value (e.g. in Zustand store)
 *                     and pass it on each subsequent call.
 * @returns          - Regime state plus the updated prevAvg for the next call
 */
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
  const breadth = top20.filter(p => p.currentRate > 0.0002).length / top20.length;

  const trend = marketAvgRate > prevAvg * 1.05 ? 'rising'
              : marketAvgRate < prevAvg * 0.8  ? 'falling'
              : 'stable';

  const label = marketAvgRate > 0.0004 ? 'HOT'
              : marketAvgRate > 0.0001 ? 'NEUTRAL'
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
  currentRate: number,
  bestRate: number,
  notional: number,
  takerFee: number,
  minAdvantage = 0.0002,
  maxBreakEven = 3
): { rotate: boolean; breakEvenHours: number; gain: number } {
  const rateDiff = bestRate - currentRate;
  const rotationCost = notional * takerFee * 2;
  const breakEvenHours = rateDiff > 0 ? rotationCost / (rateDiff * notional) : Infinity;
  const rotate = rateDiff > minAdvantage && breakEvenHours < maxBreakEven;
  const gain = rotate ? (rateDiff * notional * 24) - rotationCost : 0;
  return { rotate, breakEvenHours, gain };
}
