/**
 * engine.test.ts — Core harvest engine tests.
 * Updated for Phase 1+2: demo/isDemo removed, new runHarvestCycle signature,
 * signals return ENTER immediately (no WAIT gate).
 */
import { describe, it, expect } from 'vitest';
import { computeSignal } from '../src/engine/signals';
import { detectRegime, shouldRotate } from '../src/engine/regime';
import { runHarvestCycle } from '../src/engine/harvest';
import type { FundingEvent, FundingRate } from '../src/types/funding';
import type { Position } from '../src/types/position';
import type { HarvestConfig } from '../src/types/harvest';
import type { RegimeState } from '../src/types/account';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHistory(rate: number, count = 6, nowMs = Date.now()): FundingEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: nowMs - i * 3_600_000,
    rate,
    symbol: 'TEST',
  }));
}

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

const DEFAULT_CONFIG: HarvestConfig = {
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
  maxDrawdownPct:      0,   // disabled for most tests
  maxPairLossPct:      0,
  liquidationBufferPct: 0,
};

const HOT_REGIME: RegimeState = {
  label: 'HOT', marketAvgRate: 0.001, breadth: 0.8,
  trend: 'rising', hoursInRegime: 3, confidence: 90,
};

const COLD_REGIME: RegimeState = {
  label: 'COLD', marketAvgRate: 0.00005, breadth: 0.2,
  trend: 'falling', hoursInRegime: 5, confidence: 75,
};

const NEUTRAL_REGIME: RegimeState = {
  label: 'NEUTRAL', marketAvgRate: 0.0003, breadth: 0.55,
  trend: 'stable', hoursInRegime: 2, confidence: 72,
};

// ─── computeSignal (Phase 2) ───────────────────────────────────────────────────

describe('computeSignal — Phase 2 live-only', () => {
  it('returns ENTER immediately when rate >= entryThreshold (no elevatedCount gate)', () => {
    const signal = computeSignal(0.001, makeHistory(0.001, 1), 0.0005, 0.0002);
    expect(signal.label).toBe('ENTER');
  });

  it('returns ENTER with no history at all', () => {
    const signal = computeSignal(0.001, [], 0.0005, 0.0002);
    expect(signal.label).toBe('ENTER');
  });

  it('returns AVOID for negative rates', () => {
    const signal = computeSignal(-0.0001, [], 0.0005, 0.0002);
    expect(signal.label).toBe('AVOID');
  });

  it('returns AVOID for rate below exitThreshold', () => {
    const signal = computeSignal(0.0001, [], 0.0005, 0.0002);
    expect(signal.label).toBe('AVOID');
  });

  it('returns WAIT for rate between exit and entry threshold', () => {
    const signal = computeSignal(0.0003, [], 0.0005, 0.0002);
    expect(signal.label).toBe('WAIT');
  });

  it('persistenceHours is in signal output', () => {
    const history = makeHistory(0.001, 10);
    const signal = computeSignal(0.001, history, 0.0005, 0.0002);
    expect(typeof signal.persistenceHours).toBe('number');
    expect(signal.persistenceHours).toBeGreaterThanOrEqual(0);
  });
});

// ─── detectRegime ──────────────────────────────────────────────────────────────

describe('detectRegime', () => {
  it('classifies HOT when avg rate > 0.05%/hr', () => {
    const pairs = Array.from({ length: 25 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.001, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0);
    expect(regime.label).toBe('HOT');
  });

  it('classifies COLD when avg rate <= 0.01%/hr', () => {
    const pairs = Array.from({ length: 25 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.00005, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0);
    expect(regime.label).toBe('COLD');
  });

  it('classifies NEUTRAL for moderate rates', () => {
    const pairs = Array.from({ length: 25 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.00025, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0);
    expect(regime.label).toBe('NEUTRAL');
  });

  it('detects rising trend when avg increased by more than 5%', () => {
    const pairs = Array.from({ length: 5 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0006, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0.0005);
    expect(regime.trend).toBe('rising');
  });

  it('detects falling trend when avg dropped by more than 20%', () => {
    const pairs = Array.from({ length: 5 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0003, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0.0006);
    expect(regime.trend).toBe('falling');
  });

  it('returns nextPrevAvg equal to the computed marketAvgRate', () => {
    const pairs = Array.from({ length: 5 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0005, openInterest: 10_000_000 })
    );
    const { regime, nextPrevAvg } = detectRegime(pairs, 0);
    expect(nextPrevAvg).toBeCloseTo(regime.marketAvgRate, 8);
  });

  it('confidence is between 0 and 100', () => {
    const pairs = Array.from({ length: 20 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0004 + i * 0.00001, openInterest: 5_000_000 })
    );
    const { regime } = detectRegime(pairs, 0);
    expect(regime.confidence).toBeGreaterThanOrEqual(0);
    expect(regime.confidence).toBeLessThanOrEqual(100);
  });

  it('is pure — calling twice with same args returns same regime label', () => {
    const pairs = Array.from({ length: 10 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0006, openInterest: 10_000_000 })
    );
    const { regime: r1 } = detectRegime(pairs, 0);
    const { regime: r2 } = detectRegime(pairs, 0);
    expect(r1.label).toBe(r2.label);
    expect(r1.marketAvgRate).toBeCloseTo(r2.marketAvgRate, 8);
  });
});

// ─── shouldRotate (Phase 2 B1+B2 fixed) ──────────────────────────────────────

describe('shouldRotate — roundTripFees signature', () => {
  const ROUND_TRIP = 0.00045 + 0.00070 + 0.00015 + 0.00040; // 0.00170

  it('rotate=false when rate difference is below minAdvantage', () => {
    const { rotate } = shouldRotate(0.0005, 0.00051, 5_000, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
  });

  it('rotate=true when rate difference is large and break-even < 2h', () => {
    const { rotate, breakEvenHours } = shouldRotate(0.0004, 0.011, 5_000, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(true);
    expect(breakEvenHours).toBeLessThan(2.0);
  });

  it('rotate=false when break-even exceeds maxBreakEven', () => {
    const { rotate } = shouldRotate(0.0004, 0.000401, 5_000, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
  });

  it('gain is 0 when rotate is false', () => {
    const { rotate, gain } = shouldRotate(0.0005, 0.00051, 5_000, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(false);
    expect(gain).toBe(0);
  });

  it('gain is positive when rotation is justified', () => {
    const { rotate, gain } = shouldRotate(0.0004, 0.011, 5_000, ROUND_TRIP, 0.00003, 2.0);
    expect(rotate).toBe(true);
    expect(gain).toBeGreaterThan(0);
  });
});

// ─── runHarvestCycle ───────────────────────────────────────────────────────────

describe('runHarvestCycle — regime gate', () => {
  it('produces no ENTER actions in COLD regime when regimeGate is on', () => {
    const pairs = [makePair({ currentRate: 0.001, openInterest: 5_000_000 })];
    const { actions } = runHarvestCycle(pairs, [], COLD_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(actions.filter(a => a.type === 'ENTER').length).toBe(0);
  });

  it('logs a regime-paused INFO message in COLD regime', () => {
    const pairs = [makePair({ currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runHarvestCycle(pairs, [], COLD_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(logLines.find(l => l.type === 'INFO' && l.message.includes('COLD'))).toBeDefined();
  });

  it('allows ENTER in COLD regime when regimeGate is disabled', () => {
    const config = { ...DEFAULT_CONFIG, regimeGate: false };
    const pairs  = [makePair({ currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runHarvestCycle(pairs, [], COLD_REGIME, config, 0, 0);
    expect(logLines.find(l => l.type === 'INFO' && l.message.includes('COLD'))).toBeUndefined();
  });
});

describe('runHarvestCycle — exits', () => {
  it('emits EXIT when position rate drops below exit threshold', () => {
    const pos = makePosition({ currentRate: 0.0001, symbol: 'BTC' });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0001 })];
    const { actions } = runHarvestCycle(pairs, [pos], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    const exits = actions.filter(a => a.type === 'EXIT');
    expect(exits.length).toBeGreaterThan(0);
    expect(exits[0]).toMatchObject({ type: 'EXIT', positionId: 'pos-1' });
  });

  it('emits EXIT when position has exceeded maxHoldHours', () => {
    const pos = makePosition({ symbol: 'BTC', currentRate: 0.0009, hoursHeld: DEFAULT_CONFIG.maxHoldHours + 1 });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0009 })];
    const { actions } = runHarvestCycle(pairs, [pos], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(actions.filter(a => a.type === 'EXIT').length).toBeGreaterThan(0);
  });

  it('does not exit a healthy position with good rate and short hold', () => {
    const pos = makePosition({ currentRate: 0.0009, hoursHeld: 2 });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0009 })];
    const { actions } = runHarvestCycle(pairs, [pos], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(actions.filter(a => a.type === 'EXIT' && a.positionId === 'pos-1').length).toBe(0);
  });

  it('emits EXIT when per-pair loss limit breached', () => {
    const config = { ...DEFAULT_CONFIG, maxPairLossPct: 5, regimeGate: false };
    // notional=$2500, 5% threshold=$125. feesPaid-fundingEarned=$200-$1=$199 > $125
    const pos = makePosition({ notional: 2500, feesPaid: 200, fundingEarned: 1, currentRate: 0.001 });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.001 })];
    const { actions } = runHarvestCycle(pairs, [pos], NEUTRAL_REGIME, config, 0, 0);
    expect(actions.filter(a => a.type === 'EXIT' && a.positionId === 'pos-1').length).toBe(1);
  });
});

describe('runHarvestCycle — entries', () => {
  it('does not enter when max positions is already reached', () => {
    const config = { ...DEFAULT_CONFIG, maxPositions: 2 };
    const positions = [makePosition({ id: 'pos-1', symbol: 'BTC' }), makePosition({ id: 'pos-2', symbol: 'ETH' })];
    const pairs = [makePair({ symbol: 'SOL', currentRate: 0.001, openInterest: 5_000_000 })];
    const { actions } = runHarvestCycle(pairs, positions, HOT_REGIME, config, 0, 0);
    expect(actions.filter(a => a.type === 'ENTER').length).toBe(0);
  });

  it('skips pairs with OI below minOI', () => {
    const pairs = [makePair({ symbol: 'TINY', currentRate: 0.002, openInterest: 100_000 })];
    const { actions } = runHarvestCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(actions.filter(a => a.type === 'ENTER').length).toBe(0);
  });

  it('skips pairs below entry threshold', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0001, openInterest: 5_000_000 })];
    const { actions } = runHarvestCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(actions.filter(a => a.type === 'ENTER').length).toBe(0);
  });

  it('enters all qualifying pairs up to slotsAvailable in one cycle', () => {
    const config = { ...DEFAULT_CONFIG, maxPositions: 3, regimeGate: false };
    const pairs = [
      makePair({ symbol: 'A', currentRate: 0.001, openInterest: 5_000_000 }),
      makePair({ symbol: 'B', currentRate: 0.001, openInterest: 5_000_000 }),
      makePair({ symbol: 'C', currentRate: 0.001, openInterest: 5_000_000 }),
    ];
    const { actions } = runHarvestCycle(pairs, [], NEUTRAL_REGIME, config, 0, 0);
    expect(actions.filter(a => a.type === 'ENTER').length).toBe(3);
  });
});

describe('runHarvestCycle — log entries', () => {
  it('every cycle produces at least one log line', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runHarvestCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    expect(logLines.length).toBeGreaterThan(0);
  });

  it('all log entries have required fields', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runHarvestCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG, 0, 0);
    logLines.forEach(l => {
      expect(l).toHaveProperty('timestamp');
      expect(l).toHaveProperty('type');
      expect(l).toHaveProperty('symbol');
      expect(l).toHaveProperty('message');
      expect(l.message.length).toBeGreaterThan(0);
    });
  });
});
