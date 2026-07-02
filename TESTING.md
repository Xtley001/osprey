# Osprey — Testing Guide

## Test suite structure

```
engine-tests/
├── engine.test.ts          ← runHarvestCycle: regime gate, exits, entries, rotation signature, logging
├── signals.test.ts         ← computeSignal: ENTER/WAIT/AVOID gating, persistence counting
├── circuitBreaker.test.ts  ← Drawdown limiting: fires at threshold, blocks entries, allows exits
├── rotation.test.ts        ← shouldRotate cost/break-even math (round-trip fee fix)
└── fundingMath.test.ts     ← Rate classification, formatting helpers (USD, rate, duration)

store-tests/
├── harvestStore.test.ts    ← Toggle gating, config updates, mocked order placement, logging
├── reconciliation.test.ts  ← Startup position recovery (MATCH / ORPHAN-ON-HL / ORPHAN-LOCAL)
└── phase6.test.ts          ← Spot hedge automation: entry/exit, emergency unwind
```

8 files, 100+ tests. Engine tests are pure logic (no React, no network). Store tests mock the Hyperliquid API layer (`vi.mock('../src/api/hyperliquid', ...)`) to verify orchestration without hitting the network.

## Running tests

```bash
npm run test             # run all tests once
npm run test:watch       # watch mode
npm run test:coverage    # coverage report
```

## Key test cases

### Fee computation

```ts
// fees.test.ts — critical invariants
test('Tier 0 base rate matches HL docs', () => {
  const fees = computeFeesFromVolume(0);
  expect(fees.perpTaker).toBe(0.00045);  // 0.045%
  expect(fees.perpMaker).toBe(0.00015);  // 0.015%
  expect(fees.spotTaker).toBe(0.00070);  // 0.070%
  expect(fees.spotMaker).toBe(0.00040);  // 0.040%
});

test('Round-trip rate is correct sum', () => {
  const fees = computeFeesFromVolume(0);
  // RT = perpMaker + perpTaker + spotMaker + spotTaker
  expect(fees.roundTripRate).toBeCloseTo(0.00015 + 0.00045 + 0.00040 + 0.00070);
});

test('Break-even at 0.010%/hr with Tier 0 fees', () => {
  const fees = computeFeesFromVolume(0);
  const be = computeBreakEvenHours(0.0001, fees);  // 0.010%/hr
  // RT = 0.00170 on $1000 total = $1.70; earn $0.05/hr on $500 perp
  // break-even = 1.70 / 0.05 = 34 hours
  expect(be).toBeCloseTo(34, 0);
});
```

### Harvest engine

```ts
// engine.test.ts
test('Entry threshold at 0.005%/hr captures steady yield pairs', () => {
  const pairs = [
    { symbol: 'BTC', currentRate: 0.00005, openInterest: 50_000_000 },  // exactly at threshold
    { symbol: 'ETH', currentRate: 0.00004, openInterest: 30_000_000 },  // below threshold
    { symbol: 'SOL', currentRate: 0.00006, openInterest: 5_000_000 },   // above threshold
  ];
  const { actions } = runHarvestCycle(pairs, [], neutralRegime, config);
  const enters = actions.filter(a => a.type === 'ENTER').map(a => a.symbol);
  expect(enters).toContain('BTC');
  expect(enters).toContain('SOL');
  expect(enters).not.toContain('ETH');
});

test('Negative rate triggers immediate exit', () => {
  const positions = [{ id: 'p1', symbol: 'BTC', currentRate: -0.001, ... }];
  const { actions } = runHarvestCycle([], positions, neutralRegime, config);
  const exits = actions.filter(a => a.type === 'EXIT');
  expect(exits).toHaveLength(1);
  expect(exits[0].positionId).toBe('p1');
});

test('Max positions cap enforced', () => {
  const config = { ...DEFAULT_HARVEST_CONFIG, maxPositions: 5 };
  const activePositions = Array.from({ length: 5 }, (_, i) => mockPosition(`P${i}`));
  const pairs = Array.from({ length: 20 }, (_, i) => mockPair(`PAIR${i}`, 0.0002));
  const { actions } = runHarvestCycle(pairs, activePositions, neutralRegime, config);
  const enters = actions.filter(a => a.type === 'ENTER');
  expect(enters).toHaveLength(0);  // all slots full
});
```

### Regime detection

```ts
// engine.test.ts — detectRegime: no boundary conflict between regime and entry threshold

test('NEUTRAL regime does NOT conflict with entry threshold', () => {
  // OLD bug: HOT started at 0.04%/hr == entry threshold
  // New: NEUTRAL starts at 0.005%/hr, HOT at 0.05%/hr — well separated
  const pairsAt005pct = top20Pairs.map(p => ({ ...p, currentRate: 0.0001 }));
  const { regime } = detectRegime(pairsAt005pct, 0);
  // 0.010%/hr avg → NEUTRAL (above sub-threshold, below hot)
  expect(regime.label).toBe('NEUTRAL');
});

test('COLD regime pauses entries', () => {
  const coldPairs = top20Pairs.map(p => ({ ...p, currentRate: 0.00002 }));  // below 0.005%/hr
  const { regime } = detectRegime(coldPairs, 0);
  expect(regime.label).toBe('COLD');
});
```

## Adding new tests

When adding a new feature:
1. Write pure-logic tests in `engine-tests/` (no network calls, no DOM, no React) or orchestration tests in `store-tests/` (mock the API layer with `vi.mock`)
2. Use factory functions for fixtures (see `makePair()`, `makePosition()`, `makeHistory()` in `engine-tests/engine.test.ts`) rather than duplicating literal objects across tests
3. Run `npm run test` before pushing
