/**
 * signals.test.ts — Phase 2 aggressive signal logic.
 * Bug B3 fixed: WAIT gate removed. ENTER fires immediately at entryThreshold.
 */
import { describe, it, expect } from 'vitest';
import { computeSignal } from '../src/engine/signals';
import type { FundingEvent } from '../src/types/funding';

const ENTRY = 0.00005;
const EXIT  = 0.00003;

function makeHistory(rates: number[]): FundingEvent[] {
  return rates.map((rate, i) => ({
    symbol: 'BTC',
    timestamp: Date.now() - (rates.length - i) * 3_600_000,
    rate,
  }));
}

describe('computeSignal — Phase 2 aggressive entry', () => {
  it('returns ENTER immediately when rate >= entryThreshold (no elevatedCount gate)', () => {
    // Previously WAIT for < 2h elevation — now ENTER immediately
    const signal = computeSignal(ENTRY, [], ENTRY, EXIT);
    expect(signal.label).toBe('ENTER');
  });

  it('returns ENTER with single historical event above threshold', () => {
    const history = makeHistory([ENTRY]);
    const signal = computeSignal(ENTRY + 0.00001, history, ENTRY, EXIT);
    expect(signal.label).toBe('ENTER');
  });

  it('returns AVOID for negative rates — never enter', () => {
    const signal = computeSignal(-0.0001, [], ENTRY, EXIT);
    expect(signal.label).toBe('AVOID');
    expect(signal.confidence).toBeGreaterThanOrEqual(95);
  });

  it('returns AVOID for rate below exit threshold', () => {
    const signal = computeSignal(EXIT - 0.000001, [], ENTRY, EXIT);
    expect(signal.label).toBe('AVOID');
  });

  it('returns WAIT for rate between exit and entry thresholds', () => {
    const midRate = (EXIT + ENTRY) / 2;
    const signal = computeSignal(midRate, [], ENTRY, EXIT);
    expect(signal.label).toBe('WAIT');
  });

  it('returns ENTER immediately with no history at all', () => {
    const signal = computeSignal(ENTRY + 0.0001, [], ENTRY, EXIT);
    expect(signal.label).toBe('ENTER');
    expect(signal.persistenceHours).toBe(0);
  });

  it('persistenceHours counts consecutive hours above threshold from most recent backward', () => {
    const rates = [ENTRY, ENTRY, ENTRY, ENTRY, 0, ENTRY, ENTRY];
    const history = makeHistory(rates);
    const signal = computeSignal(ENTRY + 0.0001, history, ENTRY, EXIT);
    expect(signal.persistenceHours).toBe(2); // only last 2 are consecutive above threshold
  });

  it('persistenceHours = 72 for 72 consecutive elevated events', () => {
    const rates = Array(72).fill(ENTRY + 0.0001);
    const history = makeHistory(rates);
    const signal = computeSignal(ENTRY + 0.0001, history, ENTRY, EXIT);
    expect(signal.persistenceHours).toBe(72);
  });

  it('persistenceHours resets to 0 at first gap in sequence', () => {
    // makeHistory assigns timestamps oldest-first: rates[0] = oldest, rates[N-1] = most recent.
    // Most recent 3 (indices 12-14) are elevated, then a gap (indices 10-11), then 10 older elevated.
    const rates = [...Array(10).fill(ENTRY + 0.0001), 0.00001, 0.00001, ENTRY + 0.0001, ENTRY + 0.0001, ENTRY + 0.0001];
    const history = makeHistory(rates);
    const signal = computeSignal(ENTRY + 0.0001, history, ENTRY, EXIT);
    // Sorted desc by timestamp: most recent 3 are elevated, then gap at index 11 → persistence = 3
    expect(signal.persistenceHours).toBe(3);
  });

  it('persistenceHours = 0 with empty history', () => {
    const signal = computeSignal(ENTRY + 0.0001, [], ENTRY, EXIT);
    expect(signal.persistenceHours).toBe(0);
  });

  it('persistenceHours does NOT gate ENTER — entry fires regardless', () => {
    // Zero history — no persistence — still ENTER
    const signal = computeSignal(ENTRY, [], ENTRY, EXIT);
    expect(signal.label).toBe('ENTER');
    expect(signal.persistenceHours).toBe(0);
  });

  it('confidence increases with persistence hours', () => {
    const low  = computeSignal(ENTRY, makeHistory([ENTRY]),             ENTRY, EXIT);
    const high = computeSignal(ENTRY, makeHistory(Array(20).fill(ENTRY)), ENTRY, EXIT);
    expect(high.confidence).toBeGreaterThanOrEqual(low.confidence);
  });

  it('confidence is capped at 95', () => {
    const rates = Array(200).fill(ENTRY + 0.0001);
    const history = makeHistory(rates);
    const signal = computeSignal(ENTRY + 0.0001, history, ENTRY, EXIT);
    expect(signal.confidence).toBeLessThanOrEqual(95);
  });
});
