# 🧪 Osprey — Testing Guide

Osprey uses **Vitest** for all unit tests. The suite covers the pure-TypeScript
engine and utility layers — the parts where bugs cost real money.

---

## Quick start

```bash
# Run all 37 tests once
npm test

# Watch mode — re-runs on every file save
npm run test:watch

# With coverage report
npm run test:coverage
```

Expected output:

```
 RUN  v2.1.9

 ✓ engine-tests/backtester.test.ts  (13 tests) 103ms
 ✓ engine-tests/fundingMath.test.ts (24 tests)   7ms

 Test Files  2 passed (2)
      Tests  37 passed (37)
```

---

## Test file locations

```
engine-tests/
├── backtester.test.ts    ← backtest engine: trades, metrics, edge cases (13 tests)
└── fundingMath.test.ts   ← rate classification + format utilities (24 tests)

src/test/
└── setup.ts              ← Vitest global setup (@testing-library/jest-dom)
```

Tests live in `engine-tests/` (outside `src/`) because the backtest engine is
pure TypeScript with zero React dependencies — testable without a DOM environment.

---

## What is tested

### `engine-tests/backtester.test.ts` — 13 tests

The core `runBacktest()` function is the most financially critical code in Osprey.

| Suite | Checks |
|---|---|
| **Structure** | All required fields present; equity curve non-empty; curve starts near initial capital |
| **No trades** | Zero trades when rate is always below threshold; all metrics zero |
| **Trades fire** | ≥1 trade when rate is elevated; `fundingEarned > 0`; `feesPaid > 0` |
| **Metrics integrity** | `netProfit === fundingEarned − feesPaid`; win rate in [0, 100]; drawdown ≥ 0 |
| **Trade records** | All required fields; `exitTime > entryTime`; `hoursHeld > 0` |
| **maxHoldHours** | No trade held longer than the configured cap |

### `engine-tests/fundingMath.test.ts` — 24 tests

Rate classification and all number-formatting utilities.

| Suite | Checks |
|---|---|
| **classifyRate** | cold/warm/hot/fire boundary values; zero; negative rates |
| **rateColor** | Returns CSS variable strings; all four heat levels return distinct values |
| **formatUSD** | Sub-$1K (2dp); $K suffix; $M suffix; negative values |
| **formatRate** | `+` for positives; `−` for negatives; decimal → percent conversion |
| **formatRateRaw** | No `+` prefix; always 4 decimal places |
| **formatPct** | `+` prefix; negative; custom decimal precision |
| **formatDuration** | Correct unit (m / h / d) for sub-hour, hourly, multi-day durations |

---

## Configuration — `vitest.config.ts`

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,           // describe/it/expect available without imports
    environment: 'jsdom',    // browser globals (window, document, localStorage)
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'engine-tests/**/*.{test,spec}.ts',
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/engine/**', 'src/utils/**'],
    },
  },
});
```

---

## Writing new tests

### Adding to an existing suite

```ts
describe('formatUSD', () => {
  it('handles zero correctly', () => {
    expect(formatUSD(0)).toBe('$0.00');
  });
});
```

### New engine test file

Create `engine-tests/signals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSignal } from '../src/engine/signals';

describe('computeSignal', () => {
  it('returns ENTER when rate is elevated for 2+ hours', () => {
    const history = [
      { timestamp: Date.now() - 3_600_000, rate: 0.0006, symbol: 'BTC' },
      { timestamp: Date.now() - 7_200_000, rate: 0.0005, symbol: 'BTC' },
    ];
    const signal = computeSignal(0.0006, history, 0.0004, 0.0002);
    expect(signal.label).toBe('ENTER');
    expect(signal.confidence).toBeGreaterThan(50);
  });

  it('returns AVOID for negative rates', () => {
    const signal = computeSignal(-0.001, [], 0.0004, 0.0002);
    expect(signal.label).toBe('AVOID');
  });
});
```

### New React component test

```tsx
// src/components/shared/ErrorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = () => { throw new Error('test crash'); };

it('renders error UI when a child throws', () => {
  // Suppress the expected console.error
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary><Boom /></ErrorBoundary>);
  expect(screen.getByText(/Osprey encountered an error/i)).toBeInTheDocument();
});
```

---

## Coverage report

```bash
npm run test:coverage
# then open:
open coverage/index.html      # macOS
xdg-open coverage/index.html  # Linux / Codespaces
```

Coverage is tracked for `src/engine/**` and `src/utils/**` — the pure computation
layers. React UI components are not coverage targets.

---

## Adding tests to CI

Open `.github/workflows/ci.yml` and add the test step:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test          # ← add this line
      - run: npm run build
```

---

## Vitest vs Jest

Osprey uses Vitest because:

- **Same config as Vite** — no separate Babel/transform setup needed
- **Faster cold start** — native ESM, no CJS overhead
- **Identical API** — `describe`, `it`, `expect` are the same as Jest
- **TypeScript out of the box** — no `ts-jest` or `@babel/preset-typescript`

Migrating an existing Jest test file? Change:
```ts
// before
import { jest } from '@jest/globals';

// after
import { vi } from 'vitest';
// vi.fn() === jest.fn(), vi.spyOn() === jest.spyOn(), etc.
```
