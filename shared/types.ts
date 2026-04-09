// shared/types.ts
// Types shared between keeper bot, signal API, and quant layer.
// Keep in sync with Osprey src/types/ — do not diverge.

export type RegimeLabel = "HOT" | "NEUTRAL" | "COLD";

export interface RegimeSignal {
  regime: RegimeLabel;
  topPair: string;
  annualizedFunding: number;
  medianTopOIFunding: number;
  confidence: number;
  timestamp: number;
}

export interface SizingSignal {
  recommendedHlAllocationPct: number;
  baseAllocationForRegime: number;
  confidence: number;
  regime: RegimeLabel;
  timestamp: number;
}

export interface TargetAllocation {
  hlPct: number;
  kaminoPct: number;
}

export interface RebalanceRecord {
  timestamp: Date;
  regime: string;
  totalNav: number;
  hlBalance: number;
  kaminoBalance: number;
  targetHlPct: number;
  actualHlPct: number;
  delta: number;
  fundingRate: number;
  executed: boolean;
}

// Regime allocation targets by regime label
export const REGIME_ALLOCATION: Record<RegimeLabel, { hl: number; kamino: number }> = {
  HOT:     { hl: 0.70, kamino: 0.30 },
  NEUTRAL: { hl: 0.40, kamino: 0.60 },
  COLD:    { hl: 0.05, kamino: 0.95 },
};

// Regime thresholds — must match api/regime.ts exactly
export const REGIME_THRESHOLDS = {
  HOT_FLOOR:     0.20,  // annualised > 20% = HOT
  NEUTRAL_FLOOR: 0.08,  // annualised > 8% = NEUTRAL
} as const;
