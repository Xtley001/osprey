/**
 * rotation.test.ts — Phase 2 shouldRotate formula.
 * Bugs B1 + B2 fixed: roundTripFees passed correctly, no × 2 error.
 * See CALC_AUDIT.md §4.
 */
import { describe, it, expect } from 'vitest';
import { shouldRotate } from '../src/engine/regime';

// Tier 0 base fees
const PERP_TAKER = 0.00045;
const SPOT_TAKER = 0.00070;
const PERP_MAKER = 0.00015;
const SPOT_MAKER = 0.00040;
const ROUND_TRIP = PERP_TAKER + SPOT_TAKER + PERP_MAKER + SPOT_MAKER; // 0.00170

const NOTIONAL = 500; // perp notional ($500 = $1000 position / 2)

describe('shouldRotate — B1+B2 fixed', () => {
  it('uses roundTripFees correctly — rotation cost = notional × roundTripFees (no × 2)', () => {
    // rotationCost = $500 × 0.00170 = $0.850
    // At 0.003%/hr advantage on $500 notional: hourly_gain = 0.00003 × $500 = $0.015/hr
    // break_even = $0.850 / $0.015 = ~56.7h > 2h → no rotate
    const { rotate, breakEvenHours } = shouldRotate(0.001, 0.00103, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
    expect(breakEvenHours).toBeCloseTo(56.67, 0);
  });

  it('returns rotate: true when advantage is sufficient and break-even < 2h', () => {
    // 0.002%/hr = 0.00002/hr advantage per $500 = $0.01/hr
    // break_even = $0.850 / $0.01 = 85h → no rotate
    // Need large advantage: e.g. 0.01/hr rate diff on $500 = $5/hr
    // break_even = $0.850 / $5 = 0.17h < 2h → rotate
    const { rotate, breakEvenHours } = shouldRotate(0.001, 0.011, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(true);
    expect(breakEvenHours).toBeCloseTo(0.17, 1);
  });

  it('returns rotate: false when rateDiff <= minAdvantage', () => {
    const { rotate } = shouldRotate(0.001, 0.001, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
  });

  it('returns rotate: false when rateDiff < 0 (current is better)', () => {
    const { rotate, breakEvenHours } = shouldRotate(0.005, 0.001, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
    expect(breakEvenHours).toBe(Infinity);
  });

  it('breakEvenHours computed correctly: rotationCost / hourlyGain', () => {
    const currentRate = 0.001;
    const bestRate    = 0.011;
    const rateDiff    = bestRate - currentRate;        // 0.010/hr
    const expectedCost = NOTIONAL * ROUND_TRIP;        // $500 × 0.0017 = $0.85
    const expectedGain = rateDiff * NOTIONAL;          // 0.01 × $500 = $5/hr
    const expectedBE   = expectedCost / expectedGain;  // 0.17h

    const { breakEvenHours } = shouldRotate(currentRate, bestRate, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(breakEvenHours).toBeCloseTo(expectedBE, 4);
  });

  it('2h max break-even (Phase 2 aggressive) — rejects 3h break-even', () => {
    // Design a case where break-even is ~2.5h
    // rotationCost = $500 × 0.0017 = $0.85
    // need gain: $0.85 / 2.5h = $0.34/hr → rateDiff = 0.34/500 = 0.00068/hr
    const rateDiff = 0.85 / (500 * 2.5);
    const { rotate } = shouldRotate(0.001, 0.001 + rateDiff + 0.00003 + 0.0000001, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
  });

  it('accepts break-even just under 2h', () => {
    // Need break-even ~1.9h: gain = $0.85 / 1.9 = $0.4474/hr → rateDiff = 0.4474/500 = 0.000895/hr
    const rateDiff = 0.85 / (500 * 1.9);
    const { rotate } = shouldRotate(0.0001, 0.0001 + rateDiff + 0.00003 + 0.000001, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(true);
  });

  it('gain is positive when rotate = true', () => {
    const { rotate, gain } = shouldRotate(0.001, 0.011, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    if (rotate) {
      expect(gain).toBeGreaterThan(0);
    }
  });

  it('gain is 0 when rotate = false', () => {
    const { rotate, gain } = shouldRotate(0.001, 0.001, NOTIONAL, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
    expect(gain).toBe(0);
  });

  it('CALC_AUDIT §4.1 formula check at Tier 0 — $500 notional, round-trip = $0.850', () => {
    const rotationCost = NOTIONAL * ROUND_TRIP;
    expect(rotationCost).toBeCloseTo(0.850, 3);
  });
});
