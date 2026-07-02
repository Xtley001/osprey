# Osprey — Testing Guide

Tests are split across the monorepo's workspaces — `npm test` from the repo root runs all of them (`packages/engine`, `packages/server`, `packages/sdk`, `apps/web`). 164 tests as of the current commit.

## Suite structure

```text
packages/engine/test/          # pure engine logic — no React, no network
├── engine.test.ts             # runHarvestCycle: regime gate, exits, entries, rotation, logging
├── signals.test.ts            # computeSignal: ENTER/WAIT/AVOID gating, persistence counting
├── circuitBreaker.test.ts     # drawdown limiting: fires at threshold, blocks entries, allows exits
├── rotation.test.ts           # shouldRotate cost/break-even math (round-trip fee fix)
├── fundingMath.test.ts        # rate classification, formatting helpers (USD, rate, duration)
└── stress.test.ts             # adversarial inputs (NaN/Infinity/negatives/boundaries) + a
                               # 5,000-cycle randomized soak asserting slot limits, the
                               # negative-rate entry ban, duplicate-exit and circuit-breaker
                               # invariants

apps/web/store-tests/          # Zustand orchestration — mocks @osprey/engine's HL API surface
├── harvestStore.test.ts       # toggle gating, config updates, mocked order placement, logging
├── reconciliation.test.ts     # startup position recovery (MATCH / ORPHAN-ON-HL / ORPHAN-LOCAL)
├── phase6.test.ts             # spot hedge automation: entry/exit, emergency unwind
├── chaos.test.ts              # API failure injection: order rejects/timeouts, malformed HL
                               # data, null account state during EXIT, overlapping runCycle
└── datastress.test.ts         # 5k-pair scanner and 10k-trade history stress, position-id
                               # uniqueness across reloads, equity-curve growth cap

packages/server/test/          # Fastify route smoke tests (app.inject(), no real network)
└── app.test.ts

packages/sdk/test/             # client request/response wiring, mocked fetch
└── client.test.ts
```

## Running tests

```bash
npm test                                    # all workspaces, from repo root
npm test --workspace=packages/engine        # just the engine
npm run test:watch --workspace=apps/web     # watch mode, web app only
```

## Mocking convention

Engine tests are pure logic — no mocks needed. Store tests mock the Hyperliquid API surface at the `@osprey/engine` module boundary:

```ts
vi.mock('@osprey/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@osprey/engine')>()),
  placeMarketOrder:  vi.fn(),
  fetchAccountState: vi.fn(),
  // ...only the network-touching HL API functions are replaced
}));
```

Real engine logic (`runHarvestCycle`, `detectRegime`, …) passes through unmocked via `importOriginal` — the tests exercise genuine engine decisions against controlled network behavior.

## Invariants under test

The suites collectively enforce the properties that matter for real money:

| Invariant | Enforced by |
|---|---|
| Never enter a negative or NaN funding rate | `stress.test.ts`, `signals.test.ts` |
| Entries never exceed available position slots | `stress.test.ts`, `engine.test.ts` |
| No duplicate exits for one position in a cycle | `stress.test.ts` |
| Circuit breaker blocks entries at the drawdown threshold (boundary-exact) | `circuitBreaker.test.ts`, `stress.test.ts` |
| COLD regime pauses new entries, existing positions still monitored | `engine.test.ts`, `stress.test.ts` |
| No position recorded without a confirmed fill on HL | `chaos.test.ts`, `phase6.test.ts` |
| Spot-leg failure unwinds the perp — never a naked short | `phase6.test.ts` |
| Failed close leaves the position open for retry (no phantom close) | `chaos.test.ts` |
| A failed cycle always releases the `running` lock | `chaos.test.ts` |
| Overlapping `runCycle` calls execute the engine once | `chaos.test.ts` |
| Position ids stay unique across page reloads | `datastress.test.ts` |
| Fallback fees equal `computeFeesFromVolume(0)` (all four legs) | `stress.test.ts` |

## Adding new tests

1. Write pure-logic tests in `packages/engine/test/` (no network, no DOM, no React), or orchestration tests in `apps/web/store-tests/` using the mocking convention above.
2. Use factory functions for fixtures (see `makePair()`, `makePosition()`, `makeHistory()` in `packages/engine/test/engine.test.ts`) rather than duplicating literal objects across tests.
3. Run `npm test` from the repo root before pushing.
