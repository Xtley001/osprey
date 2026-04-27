/**
 * Dynamic Fee Fetching — Hyperliquid
 *
 * Fees on HL are NOT static. They are determined per-user by:
 *   1. 14-day rolling weighted trading volume (perp + 2× spot)
 *   2. HYPE staking tier (Wood → Diamond, 5–40% discount)
 *   3. Builder code (optional, adds builder fee on top)
 *   4. Maker volume share (rebates up to −0.003% for >3% of maker volume)
 *   5. Asset category (HIP-3 in growth mode: 90% fee reduction)
 *   6. Spot quote asset type (aligned quotes: 20% taker reduction)
 *
 * This module fetches the user's ACTUAL current fee rates from HL and
 * derives the correct rates for each leg of a delta-neutral position.
 *
 * NEVER hardcode fee values in trading logic. Always call getFees().
 */

import { HL_REST_URL } from '../utils/constants';

// ── HL API response types ──────────────────────────────────────────────────────

export interface HLUserFeesResponse {
  dailyUserVlm: HLDailyVolume[];
  feeSchedule:  HLFeeSchedule;
  userCrossRate: string;   // maker volume share (e.g. "0.0234")
  userAdd:       string;   // additional builder fee rate
  discount:      HLDiscount;
  nDays:         number;
}

export interface HLDailyVolume {
  date:      string;
  exchange:  string;
  userAdd:   string;
  vlm:       string;
}

export interface HLFeeSchedule {
  taker:    string;   // e.g. "0.00045" (0.045%)
  maker:    string;   // e.g. "0.00015" (0.015%) — positive for payment, negative for rebate
  referralDiscount: string;
}

export interface HLDiscount {
  type:    'none' | 'staking' | 'referral';
  bps:     string;   // basis points of discount e.g. "1000" = 10%
}

export interface HLMakerRebateResponse {
  rateTable: { vlmThreshold: string; fee: string }[];
  userVlm:   string;
  userFee:   string;
}

// ── Derived fees for Osprey use ─────────────────────────────────────────────────

export interface OspreyFees {
  // Perp fees (what most harvest positions use for the perp leg)
  perpTaker:   number;   // decimal, e.g. 0.00045
  perpMaker:   number;   // decimal, e.g. 0.00015 (positive = pay, negative = rebate)

  // Spot fees (used for the spot hedge leg)
  spotTaker:   number;
  spotMaker:   number;

  // Effective round-trip for a delta-neutral position
  // = (perpMaker + perpTaker) × 2  [entry maker, exit taker, on perp notional]
  // + (spotMaker + spotTaker) × 2  [entry maker, exit taker, on spot notional]
  // NOTE: caller multiplies by notional; this is just the rate sum
  roundTripRate: number;

  // Staking discount applied
  stakingDiscountPct: number;

  // Fee tier (0–6 based on volume)
  perpTierLabel: string;
  spotTierLabel: string;

  // Source: 'live' = from API, 'fallback' = base tier (no wallet connected)
  source:   'live' | 'fallback';
  fetchedAt: number;
}

// ── Base tier fallback (Tier 0, no discount, no builder code) ─────────────────
// These are the WORST CASE fees. Used when:
//   - No wallet connected (public scanner view)
//   - API call fails
//   - For backtester default when no user specified
export const FALLBACK_FEES: OspreyFees = {
  perpTaker:          0.00045,   // 0.045% — base tier T0
  perpMaker:          0.00015,   // 0.015%
  spotTaker:          0.00070,   // 0.070%
  spotMaker:          0.00040,   // 0.040%
  roundTripRate:      0.00120,   // (0.00015 + 0.00045) × 2 = 0.00120 for perp only
  stakingDiscountPct: 0,
  perpTierLabel:      'Base (Tier 0)',
  spotTierLabel:      'Base (Tier 0)',
  source:             'fallback',
  fetchedAt:          0,
};

// ── Perp fee table (base rates, no discount) ──────────────────────────────────
// Matches HL docs exactly. Volume in USD.
const PERP_TIERS = [
  { minVol: 0,          taker: 0.00045, maker: 0.00015 },
  { minVol: 5_000_000,  taker: 0.00040, maker: 0.00012 },
  { minVol: 25_000_000, taker: 0.00035, maker: 0.00008 },
  { minVol: 100_000_000,taker: 0.00030, maker: 0.00004 },
  { minVol: 500_000_000,taker: 0.00028, maker: 0.00000 },
  { minVol: 2_000_000_000, taker: 0.00026, maker: 0.00000 },
  { minVol: 7_000_000_000, taker: 0.00024, maker: 0.00000 },
] as const;

// Spot fee table
const SPOT_TIERS = [
  { minVol: 0,          taker: 0.00070, maker: 0.00040 },
  { minVol: 5_000_000,  taker: 0.00060, maker: 0.00030 },
  { minVol: 25_000_000, taker: 0.00050, maker: 0.00020 },
  { minVol: 100_000_000,taker: 0.00040, maker: 0.00010 },
  { minVol: 500_000_000,taker: 0.00035, maker: 0.00000 },
  { minVol: 2_000_000_000, taker: 0.00030, maker: 0.00000 },
  { minVol: 7_000_000_000, taker: 0.00025, maker: 0.00000 },
] as const;

type FeeTier = { minVol: number; taker: number; maker: number };

// Staking discount table — matches HL docs exactly
const STAKING_TIERS = [
  { minStaked: 500_000, discount: 0.40 },  // Diamond
  { minStaked: 100_000, discount: 0.30 },  // Platinum
  { minStaked: 10_000,  discount: 0.20 },  // Gold
  { minStaked: 1_000,   discount: 0.15 },  // Silver
  { minStaked: 100,     discount: 0.10 },  // Bronze
  { minStaked: 10,      discount: 0.05 },  // Wood
  { minStaked: 0,       discount: 0.00 },
] as const;

// Maker rebate table
const MAKER_REBATE_TIERS = [
  { minMakerShare: 0.030, rebate: -0.00003 },  // Tier 3
  { minMakerShare: 0.015, rebate: -0.00002 },  // Tier 2
  { minMakerShare: 0.005, rebate: -0.00001 },  // Tier 1
] as const;

function getTierLabel(vol: number, tiers: typeof PERP_TIERS | typeof SPOT_TIERS): string {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (vol >= tiers[i].minVol) return `Tier ${i}`;
  }
  return 'Tier 0';
}

// ── Live fee fetch from HL API ────────────────────────────────────────────────

/**
 * Fetch the user's ACTUAL current fee rates from Hyperliquid.
 *
 * The API returns the user's `feeSchedule` which is their effective perp
 * taker/maker after volume tier + staking + referral discounts.
 * We use this directly — no need to re-derive from tier tables.
 *
 * For the spot leg, we query separately (spot has its own fee schedule).
 * If spot fees aren't available we compute from volume tier.
 */
export async function fetchUserFees(
  userAddress: string,
  baseUrl = HL_REST_URL
): Promise<OspreyFees> {
  try {
    const [feesRes, volRes] = await Promise.all([
      fetch(`${baseUrl}/info`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'userFees', user: userAddress }),
      }),
      fetch(`${baseUrl}/info`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'userRateLimit', user: userAddress }),
      }),
    ]);

    if (!feesRes.ok) throw new Error(`userFees HTTP ${feesRes.status}`);

    const fees: HLUserFeesResponse = await feesRes.json();

    // HL returns effective perp taker/maker directly in feeSchedule
    const perpTaker = parseFloat(fees.feeSchedule.taker);
    const perpMaker = parseFloat(fees.feeSchedule.maker);

    // Derive spot tier from 14d weighted volume
    // HL formula: weighted_vol = perp_vol + 2 × spot_vol
    // We approximate using total volume from dailyUserVlm
    const totalVol = fees.dailyUserVlm.reduce((sum, d) => sum + parseFloat(d.vlm || '0'), 0);

    let spotTier: FeeTier = SPOT_TIERS[0];
    let perpTierLabel = 'Tier 0';
    let spotTierLabel = 'Tier 0';
    for (let i = SPOT_TIERS.length - 1; i >= 0; i--) {
      if (totalVol >= SPOT_TIERS[i].minVol) {
        spotTier = SPOT_TIERS[i];
        spotTierLabel = `Tier ${i}`;
        break;
      }
    }
    for (let i = PERP_TIERS.length - 1; i >= 0; i--) {
      if (totalVol >= PERP_TIERS[i].minVol) {
        perpTierLabel = `Tier ${i}`;
        break;
      }
    }

    // Apply discount to spot (same staking/referral discount as perp)
    const discountBps  = parseFloat(fees.discount?.bps || '0');
    const discountMult = 1 - discountBps / 10_000;
    const spotTaker    = spotTier.taker * discountMult;
    const spotMaker    = spotTier.maker * discountMult;

    // Maker cross-rate — check for rebate eligibility
    const crossRate = parseFloat(fees.userCrossRate || '0');
    let makerRebate = 0;
    for (const rebateTier of MAKER_REBATE_TIERS) {
      if (crossRate >= rebateTier.minMakerShare) {
        makerRebate = rebateTier.rebate;
        break;
      }
    }

    const effectivePerpMaker = perpMaker + makerRebate;

    // Round-trip rate for a delta-neutral position (perp leg only — spot fees separate)
    // Entry: both legs enter as maker (Alo order)
    // Exit:  both legs exit as taker (Ioc order)
    const roundTripRate = (effectivePerpMaker + perpTaker) + (spotMaker + spotTaker);

    return {
      perpTaker,
      perpMaker:          effectivePerpMaker,
      spotTaker,
      spotMaker,
      roundTripRate,
      stakingDiscountPct: discountBps / 100,
      perpTierLabel,
      spotTierLabel,
      source:             'live',
      fetchedAt:          Date.now(),
    };
  } catch (err) {
    console.warn('[fees] Live fetch failed, using fallback:', err);
    return {
      ...FALLBACK_FEES,
      source:    'fallback',
      fetchedAt: Date.now(),
    };
  }
}

/**
 * Compute fees for a public (unauthenticated) view.
 * Derives from volume alone — no staking or referral discounts applied.
 */
export function computeFeesFromVolume(fourteenDayVol: number): OspreyFees {
  let perpTier: FeeTier = PERP_TIERS[0];
  let spotTier: FeeTier = SPOT_TIERS[0];
  let perpTierLabel = 'Tier 0';
  let spotTierLabel = 'Tier 0';

  for (let i = PERP_TIERS.length - 1; i >= 0; i--) {
    if (fourteenDayVol >= PERP_TIERS[i].minVol) {
      perpTier = PERP_TIERS[i];
      perpTierLabel = `Tier ${i}`;
      break;
    }
  }
  for (let i = SPOT_TIERS.length - 1; i >= 0; i--) {
    if (fourteenDayVol >= SPOT_TIERS[i].minVol) {
      spotTier = SPOT_TIERS[i];
      spotTierLabel = `Tier ${i}`;
      break;
    }
  }

  const roundTripRate = (perpTier.maker + perpTier.taker) + (spotTier.maker + spotTier.taker);

  return {
    perpTaker:          perpTier.taker,
    perpMaker:          perpTier.maker,
    spotTaker:          spotTier.taker,
    spotMaker:          spotTier.maker,
    roundTripRate,
    stakingDiscountPct: 0,
    perpTierLabel,
    spotTierLabel,
    source:             'fallback',
    fetchedAt:          Date.now(),
  };
}

/**
 * Compute break-even hold hours for a position given current fees.
 *
 * break_even_hours = round_trip_fees / funding_per_hour
 *                 = (notional × roundTripRate) / (notional × rate)
 *                 = roundTripRate / rate
 */
export function computeBreakEvenHours(
  fundingRateHr: number,
  fees: OspreyFees
): number {
  if (fundingRateHr <= 0) return Infinity;
  return fees.roundTripRate / fundingRateHr;
}

/**
 * Compute net funding earned for a position after dynamic fees.
 *
 * Used by the harvest engine to calculate actual P&L.
 * Entry/exit fees are amortized across the hold period.
 */
export function computePositionNetFunding(params: {
  perpNotional:   number;
  spotNotional:   number;
  fundingRateHr:  number;
  hoursHeld:      number;
  fees:           OspreyFees;
}): {
  grossFunding:  number;
  entryFees:     number;
  exitFees:      number;
  totalFees:     number;
  netFunding:    number;
  feeAdjustedRate: number;  // effective hourly rate after all fees
} {
  const { perpNotional, spotNotional, fundingRateHr, hoursHeld, fees } = params;

  const grossFunding = perpNotional * fundingRateHr * hoursHeld;

  // Entry: both legs as maker (Alo post-only orders)
  const perpEntryFee = perpNotional * fees.perpMaker;
  const spotEntryFee = spotNotional * fees.spotMaker;
  const entryFees    = perpEntryFee + spotEntryFee;

  // Exit: both legs as taker (Ioc for guaranteed fill)
  const perpExitFee  = perpNotional * fees.perpTaker;
  const spotExitFee  = spotNotional * fees.spotTaker;
  const exitFees     = perpExitFee + spotExitFee;

  const totalFees    = entryFees + exitFees;
  const netFunding   = grossFunding - totalFees;
  const feeAdjustedRate = hoursHeld > 0
    ? fundingRateHr - (totalFees / perpNotional / hoursHeld)
    : fundingRateHr;

  return { grossFunding, entryFees, exitFees, totalFees, netFunding, feeAdjustedRate };
}

// ── Fee display helpers ───────────────────────────────────────────────────────

export function formatFeeRate(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

export function formatFeeRateBps(rate: number): string {
  return `${(rate * 10_000).toFixed(2)}bps`;
}

/**
 * Format a complete fee summary line for UI display.
 * Example: "Perp T0 0.045%/0.015% · Spot T0 0.070%/0.040% · RT 0.175%"
 */
export function formatFeeSummary(fees: OspreyFees): string {
  const rt    = (fees.roundTripRate * 100).toFixed(4);
  const pT    = (fees.perpTaker * 100).toFixed(4);
  const pM    = (fees.perpMaker * 100).toFixed(4);
  const sT    = (fees.spotTaker * 100).toFixed(4);
  const sM    = (fees.spotMaker * 100).toFixed(4);
  const src   = fees.source === 'live' ? '✓ live' : '⚠ fallback';
  return `Perp ${fees.perpTierLabel} ${pT}%↓/${pM}%↑ · Spot ${fees.spotTierLabel} ${sT}%↓/${sM}%↑ · RT ${rt}% [${src}]`;
}
