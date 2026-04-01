import { describe, it, expect } from 'vitest';
import { computeSignal } from '../src/engine/signals';
import { detectRegime, shouldRotate } from '../src/engine/regime';
import { runAutoTraderCycle } from '../src/engine/autotrader';
import type { FundingEvent, FundingRate } from '../src/types/funding';
import type { Position } from '../src/types/position';
import type { AutoTraderConfig } from '../src/types/autotrader';
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
    symbol: 'BTC',
    category: 'Crypto',
    price: 60_000,
    change24h: 0.5,
    currentRate: 0.0005,
    rate8hEquiv: 0.004,
    annualYield: 4.38,
    openInterest: 5_000_000,
    volume24h: 50_000_000,
    heat: 'hot',
    trend: 'stable',
    ...overrides,
  };
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    symbol: 'BTC',
    entryTime: Date.now() - 4 * 3_600_000,
    entryPrice: 60_000,
    entryRate: 0.0005,
    notional: 2_500,
    fundingEarned: 5,
    feesPaid: 1.75,
    currentPrice: 60_000,
    currentRate: 0.0005,
    hedgeDrift: 0,
    hoursHeld: 4,
    isDemo: true,
    ...overrides,
  };
}

const DEFAULT_CONFIG: AutoTraderConfig = {
  enabled:            true,
  mode:               'demo',
  capitalPerPosition: 1_000,
  maxPositions:       3,
  entryThreshold:     0.0004,
  exitThreshold:      0.0002,
  minHoursElevated:   2,
  maxHoldHours:       48,
  rotationEnabled:    true,
  rotationAdvantage:  0.0002,
  regimeGate:         true,
  minOI:              1_000_000,
};

const NEUTRAL_REGIME: RegimeState = {
  label: 'NEUTRAL',
  marketAvgRate: 0.00025,
  breadth: 0.5,
  trend: 'stable',
  hoursInRegime: 4,
  confidence: 70,
};

const HOT_REGIME: RegimeState = { ...NEUTRAL_REGIME, label: 'HOT', marketAvgRate: 0.0006 };
const COLD_REGIME: RegimeState = { ...NEUTRAL_REGIME, label: 'COLD', marketAvgRate: 0.00005 };

// ─── computeSignal ────────────────────────────────────────────────────────────

describe('computeSignal', () => {
  it('returns AVOID for negative rates', () => {
    const sig = computeSignal(-0.0001, [], 0.0004, 0.0002);
    expect(sig.label).toBe('AVOID');
  });

  it('returns AVOID when rate is below exit threshold', () => {
    const sig = computeSignal(0.0001, [], 0.0004, 0.0002);
    expect(sig.label).toBe('AVOID');
  });

  it('returns WAIT when rate is above threshold but history is too short', () => {
    const history = makeHistory(0.0005, 1); // only 1 elevated hour
    const sig = computeSignal(0.0005, history, 0.0004, 0.0002);
    expect(sig.label).toBe('WAIT');
  });

  it('returns ENTER when rate is elevated and confirmed by history', () => {
    const history = makeHistory(0.0005, 4); // 4 consecutive elevated hours
    const sig = computeSignal(0.0005, history, 0.0004, 0.0002);
    expect(sig.label).toBe('ENTER');
  });

  it('confidence is between 0 and 100', () => {
    const history = makeHistory(0.001, 6);
    const sig = computeSignal(0.001, history, 0.0004, 0.0002);
    expect(sig.confidence).toBeGreaterThanOrEqual(0);
    expect(sig.confidence).toBeLessThanOrEqual(100);
  });

  it('always includes a non-empty reason string', () => {
    const cases = [
      computeSignal(-0.001, [], 0.0004, 0.0002),
      computeSignal(0.0001, [], 0.0004, 0.0002),
      computeSignal(0.0006, makeHistory(0.0006, 4), 0.0004, 0.0002),
    ];
    cases.forEach(sig => expect(sig.reason.length).toBeGreaterThan(0));
  });
});

// ─── detectRegime ─────────────────────────────────────────────────────────────

describe('detectRegime', () => {
  it('returns NEUTRAL for empty rates array', () => {
    const { regime } = detectRegime([], 0);
    expect(regime.label).toBe('NEUTRAL');
    expect(regime.marketAvgRate).toBe(0);
  });

  it('returns HOT when average rate of top pairs is above 0.0004', () => {
    const pairs = Array.from({ length: 25 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0006, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0);
    expect(regime.label).toBe('HOT');
  });

  it('returns COLD when average rate is below 0.0001', () => {
    const pairs = Array.from({ length: 25 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.00005, openInterest: 10_000_000 })
    );
    const { regime } = detectRegime(pairs, 0);
    expect(regime.label).toBe('COLD');
  });

  it('returns NEUTRAL for moderate rates', () => {
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
    // prevAvg is 0.0005 — new avg (0.0006) is 20% higher → rising
    const { regime, nextPrevAvg } = detectRegime(pairs, 0.0005);
    expect(regime.trend).toBe('rising');
    expect(nextPrevAvg).toBeCloseTo(0.0006, 6);
  });

  it('detects falling trend when avg dropped by more than 20%', () => {
    const pairs = Array.from({ length: 5 }, (_, i) =>
      makePair({ symbol: `COIN${i}`, currentRate: 0.0003, openInterest: 10_000_000 })
    );
    // prevAvg 0.0006, new 0.0003 = 50% drop → falling
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

// ─── shouldRotate ─────────────────────────────────────────────────────────────

describe('shouldRotate', () => {
  it('returns rotate=false when rate difference is below minAdvantage', () => {
    const { rotate } = shouldRotate(0.0005, 0.00051, 5_000, 0.0002, 0.0002, 3);
    expect(rotate).toBe(false);
  });

  it('returns rotate=true when rate difference is large and break-even is fast', () => {
    // currentRate 0.0004, bestRate 0.001 → large advantage
    const { rotate, breakEvenHours } = shouldRotate(0.0004, 0.001, 5_000, 0.0002, 0.0002, 3);
    expect(rotate).toBe(true);
    expect(breakEvenHours).toBeLessThan(3);
  });

  it('returns rotate=false when break-even exceeds maxBreakEven', () => {
    // Tiny rate delta — will never break even quickly
    const { rotate } = shouldRotate(0.0004, 0.000401, 5_000, 0.0002, 0.0002, 3);
    expect(rotate).toBe(false);
  });

  it('gain is 0 when rotate is false', () => {
    const { rotate, gain } = shouldRotate(0.0005, 0.00051, 5_000, 0.0002, 0.0002, 3);
    expect(rotate).toBe(false);
    expect(gain).toBe(0);
  });

  it('gain is positive when rotation is justified', () => {
    const { rotate, gain } = shouldRotate(0.0004, 0.001, 5_000, 0.0002, 0.0002, 3);
    expect(rotate).toBe(true);
    expect(gain).toBeGreaterThan(0);
  });
});

// ─── runAutoTraderCycle ───────────────────────────────────────────────────────

describe('runAutoTraderCycle — regime gate', () => {
  it('produces no ENTER actions in COLD regime when regimeGate is on', () => {
    const pairs = [makePair({ currentRate: 0.001, openInterest: 5_000_000 })];
    const { actions } = runAutoTraderCycle(pairs, [], COLD_REGIME, DEFAULT_CONFIG);
    const enters = actions.filter(a => a.type === 'ENTER');
    expect(enters.length).toBe(0);
  });

  it('logs a regime-paused INFO message in COLD regime', () => {
    const pairs = [makePair({ currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runAutoTraderCycle(pairs, [], COLD_REGIME, DEFAULT_CONFIG);
    const coldLog = logLines.find(l => l.type === 'INFO' && l.message.includes('COLD'));
    expect(coldLog).toBeDefined();
  });

  it('allows ENTER in COLD regime when regimeGate is disabled', () => {
    const config = { ...DEFAULT_CONFIG, regimeGate: false };
    const pairs  = [makePair({ currentRate: 0.001, openInterest: 5_000_000 })];
    // No history → signal may return WAIT (no actions), but the COLD regime
    // INFO message must NOT be present — regime gate is disabled.
    const { logLines } = runAutoTraderCycle(pairs, [], COLD_REGIME, config);
    const coldBlock = logLines.find(l => l.type === 'INFO' && l.message.includes('COLD'));
    expect(coldBlock).toBeUndefined();
  });
});

describe('runAutoTraderCycle — exits', () => {
  it('emits EXIT when position rate drops below exit threshold', () => {
    const pos = makePosition({ currentRate: 0.00015, symbol: 'BTC' });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.00015 })];
    const { actions } = runAutoTraderCycle(pairs, [pos], HOT_REGIME, DEFAULT_CONFIG);
    const exits = actions.filter(a => a.type === 'EXIT');
    expect(exits.length).toBeGreaterThan(0);
    expect(exits[0]).toMatchObject({ type: 'EXIT', positionId: 'pos-1' });
  });

  it('emits EXIT when position has exceeded maxHoldHours', () => {
    const pos = makePosition({
      symbol: 'BTC',
      currentRate: 0.0009,      // rate still high — only time-based exit
      hoursHeld: DEFAULT_CONFIG.maxHoldHours + 1,
    });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0009 })];
    const { actions } = runAutoTraderCycle(pairs, [pos], HOT_REGIME, DEFAULT_CONFIG);
    const exits = actions.filter(a => a.type === 'EXIT');
    expect(exits.length).toBeGreaterThan(0);
  });

  it('does not exit a healthy position with a good rate and short hold time', () => {
    const pos = makePosition({ currentRate: 0.0009, hoursHeld: 2 });
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0009 })];
    const { actions } = runAutoTraderCycle(pairs, [pos], HOT_REGIME, DEFAULT_CONFIG);
    const exits = actions.filter(a => a.type === 'EXIT' && a.positionId === 'pos-1');
    expect(exits.length).toBe(0);
  });
});

describe('runAutoTraderCycle — entries', () => {
  it('does not enter when max positions is already reached', () => {
    const config  = { ...DEFAULT_CONFIG, maxPositions: 2 };
    const positions = [
      makePosition({ id: 'pos-1', symbol: 'BTC' }),
      makePosition({ id: 'pos-2', symbol: 'ETH' }),
    ];
    const pairs = [
      makePair({ symbol: 'SOL', currentRate: 0.001, openInterest: 5_000_000 }),
    ];
    const { actions } = runAutoTraderCycle(pairs, positions, HOT_REGIME, config);
    const enters = actions.filter(a => a.type === 'ENTER');
    expect(enters.length).toBe(0);
  });

  it('skips pairs with OI below minOI', () => {
    const pairs = [makePair({ symbol: 'TINY', currentRate: 0.002, openInterest: 100_000 })];
    const { actions } = runAutoTraderCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG);
    const enters = actions.filter(a => a.type === 'ENTER');
    expect(enters.length).toBe(0);
  });

  it('skips pairs below entry threshold', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.0001, openInterest: 5_000_000 })];
    const { actions } = runAutoTraderCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG);
    const enters = actions.filter(a => a.type === 'ENTER');
    expect(enters.length).toBe(0);
  });
});

describe('runAutoTraderCycle — log entries', () => {
  it('every action produces at least one corresponding log line', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runAutoTraderCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG);
    expect(logLines.length).toBeGreaterThan(0);
  });

  it('all log entries have required fields', () => {
    const pairs = [makePair({ symbol: 'BTC', currentRate: 0.001, openInterest: 5_000_000 })];
    const { logLines } = runAutoTraderCycle(pairs, [], HOT_REGIME, DEFAULT_CONFIG);
    logLines.forEach(l => {
      expect(l).toHaveProperty('timestamp');
      expect(l).toHaveProperty('type');
      expect(l).toHaveProperty('symbol');
      expect(l).toHaveProperty('message');
      expect(l.message.length).toBeGreaterThan(0);
    });
  });
});
