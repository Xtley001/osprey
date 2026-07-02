/**
 * circuitBreaker.test.ts — Phase 2 circuit breaker logic.
 * See CALC_AUDIT.md §6.1 for formula.
 */
import { describe, it, expect } from 'vitest';
import { runHarvestCycle } from '../src/engine/harvest';
import type { FundingRate } from '../src/types/funding';
import type { Position } from '../src/types/position';
import type { HarvestConfig } from '../src/types/harvest';
import type { RegimeState } from '../src/types/account';
import { DEFAULT_HARVEST_CONFIG } from '../src/types/harvest';

const NEUTRAL_REGIME: RegimeState = {
  label: 'NEUTRAL', marketAvgRate: 0.0002, breadth: 0.6,
  trend: 'stable', hoursInRegime: 10, confidence: 80,
};

const BASE_CONFIG: HarvestConfig = {
  ...DEFAULT_HARVEST_CONFIG,
  enabled: true,
  maxDrawdownPct: 15,
  maxPositions: 10,
  capitalPerPosition: 1000,
  entryThreshold: 0.00005,
  exitThreshold: 0.00003,
  regimeGate: false,
  rotationEnabled: false,
};

function makeQualifyingPair(symbol: string, rate = 0.001): FundingRate {
  return {
    symbol, category: 'Crypto', price: 100, change24h: 0,
    currentRate: rate, rate8hEquiv: rate * 8, annualYield: rate * 8760,
    openInterest: 5_000_000, volume24h: 1_000_000,
    heat: 'hot', trend: 'stable', persistenceHours: 10, sparkline7d: [],
  };
}

function makePosition(symbol: string, fundingEarned = 50, feesPaid = 5): Position {
  return {
    id: `pos-${symbol}`, symbol, entryTime: Date.now() - 3_600_000,
    entryPrice: 100, entryRate: 0.001, notional: 500,
    fundingEarned, feesPaid, currentPrice: 100, currentRate: 0.001,
    hedgeDrift: 0, hoursHeld: 1,
  };
}

describe('circuit breaker', () => {
  it('does NOT trigger when highWaterMark <= 0 (no baseline)', () => {
    const pairs = [makeQualifyingPair('BTC')];
    const { actions } = runHarvestCycle(pairs, [], NEUTRAL_REGIME, BASE_CONFIG, 0, 0);
    const entryActions = actions.filter(a => a.type === 'ENTER');
    expect(entryActions.length).toBeGreaterThan(0);
  });

  it('does NOT trigger when maxDrawdownPct = 0 (disabled)', () => {
    const config = { ...BASE_CONFIG, maxDrawdownPct: 0 };
    const pairs = [makeQualifyingPair('BTC')];
    const { actions } = runHarvestCycle(pairs, [], NEUTRAL_REGIME, config, -1000, 1000);
    const entryActions = actions.filter(a => a.type === 'ENTER');
    expect(entryActions.length).toBeGreaterThan(0);
  });

  it('triggers at drawdown >= maxDrawdownPct — blocks entries', () => {
    // HWM = 1000, current = 840 → drawdown = 16% >= 15%
    const pairs = [makeQualifyingPair('BTC')];
    const { actions, logLines } = runHarvestCycle(pairs, [], NEUTRAL_REGIME, BASE_CONFIG, 840, 1000);
    const entryActions = actions.filter(a => a.type === 'ENTER');
    expect(entryActions.length).toBe(0);
    const cbLog = logLines.find(l => l.message.includes('Circuit breaker'));
    expect(cbLog).toBeDefined();
    expect(cbLog?.type).toBe('ERROR');
  });

  it('does NOT trigger below maxDrawdownPct threshold', () => {
    // HWM = 1000, current = 870 → drawdown = 13% < 15%
    const pairs = [makeQualifyingPair('BTC')];
    const { actions } = runHarvestCycle(pairs, [], NEUTRAL_REGIME, BASE_CONFIG, 870, 1000);
    const entryActions = actions.filter(a => a.type === 'ENTER');
    expect(entryActions.length).toBeGreaterThan(0);
  });

  it('allows EXIT actions when circuit is tripped', () => {
    // Create a position whose rate is below exit threshold
    const lowRatePair = makeQualifyingPair('BELOW_FLOOR', 0.00001); // below exitThreshold
    const pos = makePosition('BELOW_FLOOR', 1, 50); // net loss — fees > funding
    const pairs = [lowRatePair, makeQualifyingPair('BTC')];
    const { actions } = runHarvestCycle(pairs, [pos], NEUTRAL_REGIME, BASE_CONFIG, 840, 1000);
    const exitActions = actions.filter(a => a.type === 'EXIT');
    const entryActions = actions.filter(a => a.type === 'ENTER');
    // Exits should proceed even with CB tripped
    expect(exitActions.length).toBeGreaterThan(0);
    // New entries blocked
    expect(entryActions.length).toBe(0);
  });

  it('triggers exactly at boundary (drawdown == maxDrawdownPct)', () => {
    // HWM = 1000, current = 850 → drawdown = 15.0% == 15%
    const pairs = [makeQualifyingPair('BTC')];
    const { actions } = runHarvestCycle(pairs, [], NEUTRAL_REGIME, BASE_CONFIG, 850, 1000);
    const entryActions = actions.filter(a => a.type === 'ENTER');
    expect(entryActions.length).toBe(0);
  });
});
