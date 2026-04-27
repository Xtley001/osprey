# Osprey — Testing Guide

## Test suite structure

```
engine-tests/
├── harvest.test.ts         ← Core cycle logic (entry/exit/rotation decisions)
├── portfolio.test.ts       ← Multi-pair sizing and allocation constraints
├── backtester.test.ts      ← Fee model, CAGR, Sharpe ratio correctness
├── regime.test.ts          ← Regime detection and threshold alignment
├── deltaHedge.test.ts      ← Spot hedge drift and rebalance triggers
├── fees.test.ts            ← Fee tier computation and break-even math
└── signals.test.ts         ← Per-pair ENTER/WAIT/EXIT signal logic
```

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

### Fee model in backtester

```ts
// backtester.test.ts
test('Fees apply to perpNotional (capital/2), not full capital', () => {
  const result = runBacktest({ strategy: { capitalUSDC: 1000, makerFee: 0.00045, takerFee: 0.00015, ... }, ... });
  // One round-trip = (500 × 0.00015 + 500 × 0.00015) + (500 × 0.00045 + 500 × 0.00045)
  //                = 0.15 + 0.45 = $0.60 (not $1.20 — the old bug)
  const firstTrade = result.trades[0];
  expect(firstTrade.fees).toBeCloseTo(0.60, 1);
});

test('CAGR is lower than simple annualized (no compounding benefit)', () => {
  // For positive return, CAGR > simple annualized only when hold > 1yr
  // For short backtests, CAGR < simple annualized
  const result = runBacktest(...);
  if (result.metrics.daysInBacktest < 365) {
    expect(result.metrics.cagr).toBeLessThan(result.metrics.annualizedYield);
  }
});
```

### Delta neutrality

```ts
// deltaHedge.test.ts
test('Rebalance triggers at configured drift threshold', () => {
  const status = computeDeltaStatus({
    entryPrice: 100,
    currentPrice: 112,         // 12% drift
    perpNotional: 500,
    spotNotional: 500,
    rebalanceThresholdPct: 0.10,  // 10% threshold
  });
  expect(status.requiresRebalance).toBe(true);
  expect(status.driftPct).toBeCloseTo(12);
});

test('Hedge ratio stays 1:1 when prices unchanged', () => {
  const status = computeDeltaStatus({
    entryPrice: 100, currentPrice: 100,
    perpNotional: 500, spotNotional: 500,
    rebalanceThresholdPct: 0.10,
  });
  expect(status.hedgeRatio).toBe(1.0);
  expect(status.requiresRebalance).toBe(false);
});
```

### Harvest engine

```ts
// harvest.test.ts
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
// regime.test.ts — no boundary conflict between regime and entry threshold

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
1. Write the test in `engine-tests/`
2. Tests should be pure — no network calls, no DOM, no React
3. Mock HL API responses with the fixtures in `engine-tests/fixtures/`
4. Run `npm run test` before pushing

## Backtesting your configuration changes

```bash
# Run the backtester CLI directly (no browser needed)
npx tsx engine-tests/cli-backtest.ts \
  --symbol BTC \
  --days 180 \
  --entry 0.0001 \
  --exit 0.00003 \
  --capital 1000
```
