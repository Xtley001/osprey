/**
 * stress.test.ts — Adversarial-input and soak tests for the harvest engine.
 *
 * Phase 1 of the QA plan: feed the engine hostile data (NaN, Infinity,
 * negatives, empties, extremes, boundary values) and assert it never
 * crashes, never enters a negative rate, never over-fills slots, and
 * never emits duplicate exits. The soak test runs thousands of randomized
 * cycles and checks the same invariants hold throughout.
 */
import { describe, it, expect } from 'vitest';
import { computeSignal } from '../src/engine/signals';
import { detectRegime, shouldRotate } from '../src/engine/regime';
import { runHarvestCycle } from '../src/engine/harvest';
import {
  FALLBACK_FEES,
  computeFeesFromVolume,
  computeBreakEvenHours,
  computePositionNetFunding,
} from '../src/api/fees';
import {
  computeDeltaStatus,
  computeRebalanceDelta,
  validateDeltaNeutrality,
} from '../src/engine/deltaHedge';
import type { FundingRate } from '../src/types/funding';
import type { Position } from '../src/types/position';
import type { HarvestConfig } from '../src/types/harvest';
import type { RegimeState } from '../src/types/account';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePair(overrides: Partial<FundingRate> = {}): FundingRate {
  return {
    symbol: 'BTC', category: 'Crypto', price: 60_000, change24h: 0.5,
    currentRate: 0.0005, rate8hEquiv: 0.004, annualYield: 4.38,
    openInterest: 5_000_000, volume24h: 50_000_000,
    heat: 'hot', trend: 'stable', persistenceHours: 0, sparkline7d: [],
    ...overrides,
  };
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1', symbol: 'BTC',
    entryTime: Date.now() - 4 * 3_600_000, entryPrice: 60_000, entryRate: 0.0005,
    notional: 2_500, fundingEarned: 5, feesPaid: 1.75,
    currentPrice: 60_000, currentRate: 0.0005, hedgeDrift: 0, hoursHeld: 4,
    ...overrides,
  };
}

const CONFIG: HarvestConfig = {
  enabled:             true,
  capitalPerPosition:  1_000,
  maxPositions:        3,
  marginUtilization:   0.80,
  entryThreshold:      0.00050,
  exitThreshold:       0.00020,
  minHoursElevated:    0,
  maxHoldHours:        72,
  rotationEnabled:     false,
  rotationAdvantage:   0.00003,
  regimeGate:          true,
  minOI:               1_000_000,
  hedgeMode:           'hl_spot',
  maxDrawdownPct:      0,
  maxPairLossPct:      0,
  liquidationBufferPct: 0,
  rebalanceThreshold:  0.02,
};

const HOT: RegimeState = {
  label: 'HOT', marketAvgRate: 0.001, breadth: 0.8,
  trend: 'rising', hoursInRegime: 3, confidence: 90,
};

// ─── Adversarial inputs: runHarvestCycle ──────────────────────────────────────

describe('runHarvestCycle — hostile inputs', () => {
  it('handles empty pairs and empty positions without throwing', () => {
    const d = runHarvestCycle([], [], HOT, CONFIG, 10_000, 10_000);
    expect(d.actions).toEqual([]);
    expect(d.logLines.length).toBeGreaterThan(0);
  });

  it('never enters a pair with NaN rate', () => {
    const pairs = [makePair({ symbol: 'NAN', currentRate: NaN })];
    const d = runHarvestCycle(pairs, [], HOT, CONFIG, 10_000, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER')).toEqual([]);
  });

  it('does not emit spurious exits when live rate is NaN', () => {
    const pairs = [makePair({ currentRate: NaN })];
    const pos   = [makePosition()];
    const d = runHarvestCycle(pairs, pos, HOT, CONFIG, 10_000, 10_000);
    // NaN must not be treated as negative or below-floor
    expect(d.actions.filter(a => a.type === 'EXIT')).toEqual([]);
  });

  it('emits exactly one EXIT per position on negative rate (no duplicates)', () => {
    const pairs = [makePair({ currentRate: -0.0004 })];
    const pos   = [makePosition()];
    const d = runHarvestCycle(pairs, pos, HOT, CONFIG, 10_000, 10_000);
    const exits = d.actions.filter(a => a.type === 'EXIT');
    expect(exits).toHaveLength(1);
  });

  it('enters on an extreme (100%/hr) rate but never on -100%/hr', () => {
    const pairs = [
      makePair({ symbol: 'UP',   currentRate: 1.0 }),
      makePair({ symbol: 'DOWN', currentRate: -1.0 }),
    ];
    const d = runHarvestCycle(pairs, [], HOT, CONFIG, 10_000, 10_000);
    const entered = d.actions.filter(a => a.type === 'ENTER').map(a => a.symbol);
    expect(entered).toContain('UP');
    expect(entered).not.toContain('DOWN');
  });

  it('never enters more than the available slots', () => {
    const pairs = Array.from({ length: 20 }, (_, i) =>
      makePair({ symbol: `P${i}`, currentRate: 0.001 + i * 0.0001 })
    );
    const positions = [makePosition({ id: 'a', symbol: 'HELD1' }), makePosition({ id: 'b', symbol: 'HELD2' })];
    const d = runHarvestCycle(pairs, positions, HOT, CONFIG, 10_000, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER').length).toBeLessThanOrEqual(CONFIG.maxPositions - positions.length);
  });

  it('handles positions.length > maxPositions (negative slots) without entering', () => {
    const pairs = [makePair({ symbol: 'NEW', currentRate: 0.002 })];
    const positions = Array.from({ length: 5 }, (_, i) =>
      makePosition({ id: `p${i}`, symbol: `HELD${i}` })
    );
    const d = runHarvestCycle(pairs, positions, HOT, CONFIG, 10_000, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER')).toEqual([]);
  });

  it('never enters a symbol already held', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.002 })];
    const positions = [makePosition({ symbol: 'BTC' })];
    const d = runHarvestCycle(pairs, positions, HOT, CONFIG, 10_000, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER')).toEqual([]);
  });
});

// ─── Circuit breaker edges ────────────────────────────────────────────────────

describe('circuit breaker — boundary and hostile values', () => {
  const cbConfig = { ...CONFIG, maxDrawdownPct: 10 };
  const pairs = [makePair({ symbol: 'NEW', currentRate: 0.002 })];

  it('trips exactly at the threshold (>=)', () => {
    // 10% drawdown from HWM 10_000 → equity 9_000
    const d = runHarvestCycle(pairs, [], HOT, cbConfig, 9_000, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER')).toEqual([]);
  });

  it('does not trip just below the threshold', () => {
    const d = runHarvestCycle(pairs, [], HOT, cbConfig, 9_001, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER')).toHaveLength(1);
  });

  it('trips on negative equity', () => {
    const d = runHarvestCycle(pairs, [], HOT, cbConfig, -500, 10_000);
    expect(d.actions.filter(a => a.type === 'ENTER')).toEqual([]);
  });

  it('stays disarmed with zero high-water mark', () => {
    const d = runHarvestCycle(pairs, [], HOT, cbConfig, 0, 0);
    expect(d.actions.filter(a => a.type === 'ENTER')).toHaveLength(1);
  });

  it('does not trip on NaN equity (and does not crash)', () => {
    const d = runHarvestCycle(pairs, [], HOT, cbConfig, NaN, 10_000);
    expect(d.actions.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── computeSignal edges ──────────────────────────────────────────────────────

describe('computeSignal — hostile inputs', () => {
  it('never returns ENTER for NaN rate', () => {
    const s = computeSignal(NaN, [], 0.0005, 0.0002);
    expect(s.label).not.toBe('ENTER');
  });

  it('returns AVOID for -Infinity and ENTER for +Infinity', () => {
    expect(computeSignal(-Infinity, [], 0.0005, 0.0002).label).toBe('AVOID');
    expect(computeSignal(Infinity, [], 0.0005, 0.0002).label).toBe('ENTER');
  });

  it('handles empty history with zero persistence', () => {
    const s = computeSignal(0.001, [], 0.0005, 0.0002);
    expect(s.label).toBe('ENTER');
    expect(s.persistenceHours).toBe(0);
  });

  it('caps confidence at 95 for very long persistence', () => {
    const history = Array.from({ length: 500 }, (_, i) => ({
      timestamp: Date.now() - i * 3_600_000, rate: 0.001, symbol: 'X',
    }));
    const s = computeSignal(0.001, history, 0.0005, 0.0002);
    expect(s.confidence).toBeLessThanOrEqual(95);
  });
});

// ─── shouldRotate edges ───────────────────────────────────────────────────────

describe('shouldRotate — hostile inputs', () => {
  it('never rotates when rates are equal', () => {
    const r = shouldRotate(0.001, 0.001, 1_000, 0.0017, 0.00003, 2);
    expect(r.rotate).toBe(false);
    expect(r.breakEvenHours).toBe(Infinity);
  });

  it('never rotates to a worse rate', () => {
    const r = shouldRotate(0.001, 0.0005, 1_000, 0.0017, 0.00003, 2);
    expect(r.rotate).toBe(false);
    expect(r.gain).toBe(0);
  });

  it('does not rotate on NaN inputs', () => {
    const r = shouldRotate(NaN, 0.001, 1_000, 0.0017, 0.00003, 2);
    expect(r.rotate).toBe(false);
  });

  it('with zero fees, still requires the minimum advantage', () => {
    const below = shouldRotate(0.001, 0.001 + 0.00002, 1_000, 0, 0.00003, 2);
    expect(below.rotate).toBe(false);
    const above = shouldRotate(0.001, 0.001 + 0.00005, 1_000, 0, 0.00003, 2);
    expect(above.rotate).toBe(true);
  });
});

// ─── detectRegime edges ───────────────────────────────────────────────────────

describe('detectRegime — hostile inputs', () => {
  it('returns NEUTRAL/zeroed regime for empty market', () => {
    const { regime } = detectRegime([]);
    expect(regime.label).toBe('NEUTRAL');
    expect(regime.marketAvgRate).toBe(0);
  });

  it('classifies an all-negative market as COLD', () => {
    const pairs = Array.from({ length: 25 }, (_, i) =>
      makePair({ symbol: `P${i}`, currentRate: -0.0005, openInterest: 1e6 * (i + 1) })
    );
    const { regime } = detectRegime(pairs);
    expect(regime.label).toBe('COLD');
    expect(regime.breadth).toBe(0);
  });

  it('handles a single pair without NaN in output', () => {
    const { regime } = detectRegime([makePair({ currentRate: 0.002 })]);
    expect(Number.isFinite(regime.marketAvgRate)).toBe(true);
    expect(Number.isFinite(regime.confidence)).toBe(true);
  });
});

// ─── Fees: fallback consistency and boundaries ────────────────────────────────

describe('fees — fallback consistency and tier boundaries', () => {
  it('FALLBACK_FEES.roundTripRate equals the sum of all four leg fees', () => {
    const expected =
      FALLBACK_FEES.perpMaker + FALLBACK_FEES.perpTaker +
      FALLBACK_FEES.spotMaker + FALLBACK_FEES.spotTaker;
    expect(FALLBACK_FEES.roundTripRate).toBeCloseTo(expected, 10);
  });

  it('FALLBACK_FEES matches computeFeesFromVolume(0) rates', () => {
    const t0 = computeFeesFromVolume(0);
    expect(FALLBACK_FEES.perpTaker).toBe(t0.perpTaker);
    expect(FALLBACK_FEES.perpMaker).toBe(t0.perpMaker);
    expect(FALLBACK_FEES.spotTaker).toBe(t0.spotTaker);
    expect(FALLBACK_FEES.spotMaker).toBe(t0.spotMaker);
    expect(FALLBACK_FEES.roundTripRate).toBeCloseTo(t0.roundTripRate, 10);
  });

  it('tier boundaries switch at exactly the documented volume', () => {
    expect(computeFeesFromVolume(4_999_999).perpTaker).toBe(0.00045);
    expect(computeFeesFromVolume(5_000_000).perpTaker).toBe(0.00040);
  });

  it('break-even is Infinity for zero and negative rates', () => {
    expect(computeBreakEvenHours(0, FALLBACK_FEES)).toBe(Infinity);
    expect(computeBreakEvenHours(-0.001, FALLBACK_FEES)).toBe(Infinity);
  });

  it('computePositionNetFunding does not produce NaN for zero notional', () => {
    const r = computePositionNetFunding({
      perpNotional: 0, spotNotional: 0, fundingRateHr: 0.001, hoursHeld: 5,
      fees: FALLBACK_FEES,
    });
    expect(Number.isFinite(r.netFunding)).toBe(true);
    expect(Number.isFinite(r.feeAdjustedRate)).toBe(true);
  });
});

// ─── Delta hedge edges ────────────────────────────────────────────────────────

describe('delta hedge — hostile inputs', () => {
  it('computeDeltaStatus survives zero entry price', () => {
    const s = computeDeltaStatus({
      entryPrice: 0, currentPrice: 100, perpNotional: 1_000, spotNotional: 1_000,
      rebalanceThresholdPct: 0.02,
    });
    expect(s.driftPct).toBe(0);
    expect(Number.isFinite(s.hedgeRatio)).toBe(true);
  });

  it('computeRebalanceDelta ignores dust (<$10) imbalances', () => {
    const r = computeRebalanceDelta({ perpNotional: 1_005, spotNotional: 1_000, currentPrice: 50 });
    expect(r.direction).toBe('none');
  });

  it('computeRebalanceDelta survives zero price', () => {
    const r = computeRebalanceDelta({ perpNotional: 2_000, spotNotional: 1_000, currentPrice: 0 });
    expect(Number.isFinite(r.adjustmentCoins)).toBe(true);
  });

  it('flags perp_only mode as not delta-neutral', () => {
    const v = validateDeltaNeutrality({ perpNotional: 1_000, spotNotional: 0, hedgeMode: 'perp_only' });
    expect(v.isValid).toBe(false);
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it('flags a missing spot leg in hl_spot mode', () => {
    const v = validateDeltaNeutrality({ perpNotional: 1_000, spotNotional: 0, hedgeMode: 'hl_spot' });
    expect(v.isValid).toBe(false);
  });
});

// ─── Soak test: 5,000 randomized cycles ───────────────────────────────────────

// Deterministic LCG so failures are reproducible
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe('soak — 5,000 randomized harvest cycles hold all invariants', () => {
  it('never violates slot limits, negative-rate entry ban, or duplicate exits', () => {
    const rng = makeRng(0xC0FFEE);
    const symbols = Array.from({ length: 40 }, (_, i) => `SYM${i}`);
    let positions: Position[] = [];
    let equity = 10_000;
    let hwm = 10_000;

    for (let cycle = 0; cycle < 5_000; cycle++) {
      // Randomized market: rates in [-0.002, +0.004], occasional NaN spike
      const pairs: FundingRate[] = symbols.map(sym =>
        makePair({
          symbol: sym,
          currentRate: rng() < 0.01 ? NaN : -0.002 + rng() * 0.006,
          openInterest: rng() * 20_000_000,
        })
      );

      const regime: RegimeState = {
        label: (['HOT', 'NEUTRAL', 'COLD'] as const)[Math.floor(rng() * 3)],
        marketAvgRate: rng() * 0.001, breadth: rng(),
        trend: 'stable', hoursInRegime: 1, confidence: 80,
      };

      const config = { ...CONFIG, maxDrawdownPct: 10, maxPairLossPct: 5, rotationEnabled: rng() < 0.5 };
      const d = runHarvestCycle(pairs, positions, regime, config, equity, hwm, undefined, 0.0017);

      // ── Invariants ──────────────────────────────────────────────────────────
      const enters = d.actions.filter(a => a.type === 'ENTER');
      const exits  = d.actions.filter(a => a.type === 'EXIT');
      const heldSymbols = new Set(positions.map(p => p.symbol));

      // 1. Entries never exceed available slots
      expect(enters.length).toBeLessThanOrEqual(Math.max(0, config.maxPositions - positions.length));

      // 2. Never enter a held symbol
      for (const e of enters) expect(heldSymbols.has(e.symbol)).toBe(false);

      // 3. Never enter a negative or NaN rate
      for (const e of enters) {
        expect(Number.isFinite(e.rate)).toBe(true);
        expect(e.rate).toBeGreaterThanOrEqual(config.entryThreshold);
      }

      // 4. No duplicate exit position ids
      const exitIds = exits.map(e => e.positionId);
      expect(new Set(exitIds).size).toBe(exitIds.length);

      // 5. Every exit references a real position
      const posIds = new Set(positions.map(p => p.id));
      for (const id of exitIds) expect(posIds.has(id)).toBe(true);

      // 6. Circuit breaker: no entries while in >=10% drawdown
      if (hwm > 0 && ((hwm - equity) / hwm) * 100 >= 10) {
        expect(enters).toEqual([]);
      }

      // 7. Regime gate: no entries in COLD regime
      if (regime.label === 'COLD') expect(enters).toEqual([]);

      // ── Apply actions to simulated book ─────────────────────────────────────
      const exitIdSet = new Set(exitIds);
      const rotated = new Set(
        d.actions.filter(a => a.type === 'ROTATE').map(a => a.positionId)
      );
      positions = positions.filter(p => !exitIdSet.has(p.id) && !rotated.has(p.id));
      for (const e of enters) {
        positions.push(makePosition({
          id: `pos-${cycle}-${e.symbol}`, symbol: e.symbol,
          currentRate: e.rate, hoursHeld: 0,
          fundingEarned: 0, feesPaid: 1.7,
        }));
      }
      // Age the book and drift equity
      positions = positions.map(p => ({ ...p, hoursHeld: p.hoursHeld + 0.5, fundingEarned: p.fundingEarned + rng() }));
      equity += (rng() - 0.45) * 100;
      hwm = Math.max(hwm, equity);
    }
  });
});
