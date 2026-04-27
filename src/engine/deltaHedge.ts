/**
 * Delta Hedge Engine — spot hedge leg management.
 *
 * Every delta-neutral position has TWO legs:
 *   Short perp  → captures funding payments
 *   Long spot   → cancels directional exposure
 *
 * Without the spot leg, the position is a naked short — entirely defeating
 * the purpose of funding harvesting. This module manages the spot leg.
 *
 * Hedge modes:
 *   'hl_spot'        — use Hyperliquid spot market (preferred, same venue)
 *   'external_spot'  — user holds spot on another exchange; only manage perp
 *   'perp_only'      — DANGEROUS: no hedge, directional exposure, not delta-neutral
 */

export type HedgeMode = 'hl_spot' | 'external_spot' | 'perp_only';

export interface DeltaStatus {
  perpNotional:    number;
  spotNotional:    number;
  driftPct:        number;     // % deviation between current price and entry price
  hedgeRatio:      number;     // spotNotional / perpNotional (target: 1.0)
  requiresRebalance: boolean;
}

/**
 * Compute current delta status for a position.
 * Rebalance is triggered when price drifts > rebalanceThresholdPct from entry.
 */
export function computeDeltaStatus(params: {
  entryPrice:           number;
  currentPrice:         number;
  perpNotional:         number;
  spotNotional:         number;
  rebalanceThresholdPct: number;
}): DeltaStatus {
  const { entryPrice, currentPrice, perpNotional, spotNotional, rebalanceThresholdPct } = params;

  const driftPct   = entryPrice > 0
    ? Math.abs((currentPrice - entryPrice) / entryPrice) * 100
    : 0;

  const hedgeRatio = perpNotional > 0 ? spotNotional / perpNotional : 1;
  const requiresRebalance = driftPct > rebalanceThresholdPct * 100;

  return { perpNotional, spotNotional, driftPct, hedgeRatio, requiresRebalance };
}

/**
 * Build a Hyperliquid spot order payload.
 *
 * HL spot market uses asset indices separate from the perp universe.
 * The spot asset is identified by the "tokenId" field from HL's spotMeta API.
 * Format: { type: 'spotOrder', orders: [...] }
 */
export function buildSpotOrderPayload(params: {
  tokenIndex: number;
  isBuy:      boolean;
  sz:         string;   // formatted to asset's szDecimals
  px:         string;   // formatted to 6 significant figures
  tif:        'Ioc' | 'Gtc' | 'Alo';
}): object {
  return {
    type: 'spotOrder',
    orders: [{
      a:  params.tokenIndex,
      b:  params.isBuy,
      p:  params.px,
      s:  params.sz,
      r:  false,
      t:  { limit: { tif: params.tif } },
    }],
    grouping: 'na',
  };
}

/**
 * Calculate rebalance delta.
 * Returns the notional adjustment needed to restore delta-neutral sizing.
 *
 * Example: If perp has drifted to $5,500 notional but spot is at $5,200,
 * we need to buy $300 more spot (or reduce the perp by $300).
 * Preferred: adjust spot (leave perp running to keep collecting funding).
 */
export function computeRebalanceDelta(params: {
  perpNotional:  number;
  spotNotional:  number;
  currentPrice:  number;
}): {
  adjustmentUSDC: number;    // positive = buy more spot, negative = sell spot
  adjustmentCoins: number;   // size in base asset
  direction: 'buy_spot' | 'sell_spot' | 'none';
} {
  const { perpNotional, spotNotional, currentPrice } = params;
  const diff = perpNotional - spotNotional;

  if (Math.abs(diff) < 10) {
    return { adjustmentUSDC: 0, adjustmentCoins: 0, direction: 'none' };
  }

  return {
    adjustmentUSDC:  diff,
    adjustmentCoins: currentPrice > 0 ? Math.abs(diff) / currentPrice : 0,
    direction:       diff > 0 ? 'buy_spot' : 'sell_spot',
  };
}

/**
 * Simulate funding accrual for demo mode.
 * Called hourly to update demo position P&L.
 *
 * Real positions use HL's cumFunding.sinceOpen from the clearinghouseState API.
 */
export function simulateHourlyFunding(params: {
  perpNotional:  number;
  currentRate:   number;   // current hourly funding rate (decimal)
}): number {
  // Funding is paid on the perp notional only. Spot earns no funding.
  return params.perpNotional * params.currentRate;
}

/**
 * Validate that both legs of a delta-neutral position are present and balanced.
 * Returns warnings for the UI.
 */
export function validateDeltaNeutrality(params: {
  perpNotional:  number;
  spotNotional:  number;
  hedgeMode:     HedgeMode;
}): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const { perpNotional, spotNotional, hedgeMode } = params;

  if (hedgeMode === 'perp_only') {
    warnings.push('⚠ PERP ONLY mode — no spot hedge. Directional exposure is LIVE. This is NOT delta-neutral.');
  }

  if (hedgeMode !== 'perp_only') {
    const hedgeRatio = perpNotional > 0 ? spotNotional / perpNotional : 0;
    if (hedgeRatio < 0.95) {
      warnings.push(`Hedge ratio ${(hedgeRatio * 100).toFixed(1)}% — spot leg is under-hedged. Rebalance recommended.`);
    }
    if (hedgeRatio > 1.05) {
      warnings.push(`Hedge ratio ${(hedgeRatio * 100).toFixed(1)}% — spot leg is over-hedged. Minor inefficiency.`);
    }
  }

  return { isValid: warnings.length === 0 || hedgeMode === 'external_spot', warnings };
}
