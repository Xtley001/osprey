/**
 * store-tests/datastress.test.ts — Phase 2 of the QA plan.
 *
 * Large-dataset stress on the zustand stores (the pieces that scale with
 * market size and trading history), plus data-integrity regressions:
 * duplicate-id safety in positionStore after a simulated reload.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useScannerStore } from '../src/store/scannerStore';
import { usePositionStore } from '../src/store/positionStore';
import { useEquityCurveStore } from '../src/store/equityCurveStore';
import type { FundingRate } from '@osprey/engine';

function makePairs(n: number): FundingRate[] {
  const cats = ['Crypto', 'Meme', 'DeFi', 'L1'] as const;
  return Array.from({ length: n }, (_, i) => ({
    symbol: `SYM${i}`, category: cats[i % 4] as FundingRate['category'],
    price: 1 + (i % 1000), change24h: 0,
    currentRate: ((i * 7919) % 1000 - 300) / 1_000_000,
    rate8hEquiv: 0, annualYield: (i % 90),
    openInterest: (i * 104729) % 50_000_000,
    volume24h: (i * 15485863) % 100_000_000,
    heat: 'warm', trend: 'stable', persistenceHours: 0, sparkline7d: [],
  } as FundingRate));
}

describe('scannerStore — 5,000-pair market', () => {
  beforeEach(() => {
    useScannerStore.setState({
      pairs: [], filteredPairs: [], filter: 'All', sortBy: 'rate', searchQuery: '',
    });
  });

  it('filter + sort + search over 5,000 pairs completes fast and correctly', () => {
    const pairs = makePairs(5_000);
    useScannerStore.setState({ pairs, filteredPairs: pairs });

    const t0 = performance.now();
    useScannerStore.getState().setFilter('Meme' as never);
    useScannerStore.getState().setSortBy('oi' as never);
    useScannerStore.getState().setSearch('SYM1');
    const elapsed = performance.now() - t0;

    const result = useScannerStore.getState().filteredPairs;
    // Correctness: every row matches both filter and search
    expect(result.every(p => p.category === 'Meme' && p.symbol.includes('SYM1'))).toBe(true);
    // Sorted by OI descending
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].openInterest).toBeGreaterThanOrEqual(result[i].openInterest);
    }
    // Perf envelope: three consecutive recomputes over 5k pairs
    expect(elapsed).toBeLessThan(250);
  });

  it('empty search resets to full filtered set (no stale rows)', () => {
    const pairs = makePairs(1_000);
    useScannerStore.setState({ pairs, filteredPairs: pairs });
    useScannerStore.getState().setSearch('SYM99');
    useScannerStore.getState().setSearch('');
    expect(useScannerStore.getState().filteredPairs).toHaveLength(1_000);
  });
});

describe('positionStore — 10,000-trade history', () => {
  beforeEach(() => {
    usePositionStore.setState({ positions: [], trades: [] });
  });

  it('closePosition stays fast with 10,000 existing trades', () => {
    const trades = Array.from({ length: 10_000 }, (_, i) => ({
      id: `trade-${i}`, symbol: 'BTC', entryTime: i, exitTime: i + 1,
      hoursHeld: 1, avgRate: 0.0005, grossFunding: 1, fees: 0.5, net: 0.5,
    }));
    usePositionStore.setState({ trades: trades as never });
    const id = usePositionStore.getState().openPosition({
      symbol: 'ETH', entryTime: Date.now(), entryPrice: 2000, entryRate: 0.0005,
      notional: 500, fundingEarned: 1, feesPaid: 0.5,
      currentPrice: 2000, currentRate: 0.0005, hedgeDrift: 0, hoursHeld: 1,
    });

    const t0 = performance.now();
    usePositionStore.getState().closePosition(id);
    const elapsed = performance.now() - t0;

    expect(usePositionStore.getState().trades).toHaveLength(10_001);
    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(elapsed).toBeLessThan(100);
  });

  it('never assigns an id that collides with a persisted position (reload scenario)', () => {
    // Simulate rehydration from localStorage: positions exist from a previous
    // session but the module-level id counter has been reset by the reload.
    usePositionStore.setState({
      positions: [
        {
          id: 'pos-1', symbol: 'BTC', entryTime: 1, entryPrice: 60_000, entryRate: 0.0005,
          notional: 500, fundingEarned: 10, feesPaid: 1,
          currentPrice: 60_000, currentRate: 0.0005, hedgeDrift: 0, hoursHeld: 5,
        },
        {
          id: 'pos-2', symbol: 'SOL', entryTime: 2, entryPrice: 150, entryRate: 0.0007,
          notional: 500, fundingEarned: 8, feesPaid: 1,
          currentPrice: 150, currentRate: 0.0007, hedgeDrift: 0, hoursHeld: 4,
        },
      ] as never,
      trades: [],
    });

    const existing = new Set(usePositionStore.getState().positions.map(p => p.id));
    const newIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      newIds.push(usePositionStore.getState().openPosition({
        symbol: `NEW${i}`, entryTime: Date.now(), entryPrice: 100, entryRate: 0.0005,
        notional: 500, fundingEarned: 0, feesPaid: 0.85,
        currentPrice: 100, currentRate: 0.0005, hedgeDrift: 0, hoursHeld: 0,
      }));
    }

    // No new id may collide with a persisted one or with each other
    for (const id of newIds) expect(existing.has(id)).toBe(false);
    expect(new Set(newIds).size).toBe(newIds.length);

    // And closing one position must remove exactly one
    usePositionStore.getState().closePosition(newIds[0]);
    expect(usePositionStore.getState().positions).toHaveLength(6);
  });
});

describe('equityCurveStore — unbounded growth guard', () => {
  it('caps the curve at 8,760 points (1 year hourly)', () => {
    useEquityCurveStore.getState().reset();
    for (let i = 0; i < 9_500; i++) {
      useEquityCurveStore.getState().append({ timestamp: i, cumulativeNet: i * 0.1 });
    }
    const curve = useEquityCurveStore.getState().curve;
    expect(curve.length).toBe(8_760);
    // Oldest points dropped, newest kept
    expect(curve[curve.length - 1].timestamp).toBe(9_499);
    expect(useEquityCurveStore.getState().highWaterMark).toBeCloseTo(949.9, 5);
  });
});
