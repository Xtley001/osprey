# Osprey — Architecture and Internals

Osprey is a perpetual funding rate harvesting system on Hyperliquid. It opens delta-neutral positions (short perp + long spot hedge) across as many qualifying pairs as available margin allows, collecting funding payments every hour while maintaining near-zero directional exposure. It is not a directional trader and not a spike chaser — it is a systematic yield engine.

## Core invariant: delta neutrality

Every position must have both legs:

```text
Short perp  → captures the funding premium embedded in the perpetual
Long spot   → cancels directional exposure (price moves cancel out)
```

If only the perp leg is placed, the position is a naked short: when price moves against it, capital bleeds. The whole premise of funding harvesting — direction-agnosticism — requires the spot hedge. The `deltaHedge.ts` module tracks hedge drift and triggers rebalancing when drift exceeds the configured threshold.

## Data flow

```text
HL REST API (every 60s)
  └→ scannerStore (pairs, rates, OI, heat)
      └→ HarvestService (triggers on lastUpdated change)
          └→ runHarvestCycle (engine/harvest.ts)
              ├→ checkNegativeRateExits   (immediate, priority 1)
              ├→ detectRegime             (HOT/NEUTRAL/COLD gate)
              ├→ checkExits               (rate floor, max hold)
              ├→ checkRotations           (optional, rate advantage)
              └→ checkEntries             (portfolio construction)
                  └→ buildPortfolio       (engine/portfolio.ts)
                      ├→ scoreForAllocation  (rate + OI + heat)
                      └→ allocations[]      → harvestStore executes orders
```

## Financial formulas

### Funding earned per hour

```text
gross_per_hour = perp_notional × funding_rate_hr
               = (capital_per_pair / 2) × rate
```

Only the perp notional earns funding. The spot leg earns zero funding — it is a pure hedge.

### Yield projection at scale

| Capital | Pairs | Avg rate | Perp notional | Funding/day | Net APY |
|---|---|---|---|---|---|
| $10,000 | 20 | 0.010%/hr | $5,000 | $12.00 | ~43% |
| $50,000 | 50 | 0.010%/hr | $25,000 | $60.00 | ~43% |
| $250,000 | 100 | 0.010%/hr | $125,000 | $300.00 | ~43% |

APY scales linearly with positions. Osprey targets the steady-state 0.005–0.020%/hr range that persists for weeks — not the 0.04%+ spikes that last hours.

### APY and annualized return

```text
simple_APY        = rate_per_hour × 8760                       (snapshot, illustrative)
simple_annualized = (total_return_pct / days_elapsed) × 365
CAGR              = (final_equity / initial_capital)^(1 / years) − 1
```

Both are shown on the Analytics page, computed from the live equity curve. CAGR is the gold standard for reporting live performance.

### Sharpe ratio

```text
hourly_returns[]  = equity_curve[i].equity / equity_curve[i-1].equity − 1
rf_hourly         = 0.05 / 8760                    (5% annual risk-free rate)
excess[]          = hourly_returns − rf_hourly
sharpe_annualized = mean(excess) / std(excess) × sqrt(8760)
```

An earlier formula computed Sharpe on per-trade returns scaled by `sqrt(8760 / avgHoldHours)`, which overstates Sharpe for short trades and understates it for long holds. Hourly equity-curve returns are statistically cleaner and industry-standard for continuous strategies.

### Fee model

```text
perp_notional  = capital_per_pair / 2
spot_notional  = capital_per_pair / 2

entry_fees = perp_notional × perp_maker + spot_notional × spot_maker
exit_fees  = perp_notional × perp_taker + spot_notional × spot_taker
round_trip = (capital_per_pair / 2) × (perp_maker + perp_taker + spot_maker + spot_taker)
```

An earlier version used the full `capitalUSDC` (not `/2`) as the fee base per leg, overstating fees by 2×.

### Order routing: maker first

Osprey defaults to post-only (`Alo`) routing on entries and falls back to `Ioc` (taker) only if the order would cross the book. Exits always use `Ioc` — certainty over rebate.

| Order type | Perp fee (Tier 0) | Rationale |
|---|---|---|
| `Alo` (maker) | 0.015% | Default for entries — rebate-side pricing |
| `Ioc` (taker) | 0.045% | Exits and thin-spread fallback — guaranteed fill |

### Hourly settlement edge

Hyperliquid pays funding every hour; Binance pays every 8 hours. The yield difference from settlement frequency alone is small (both converge near the continuous-compounding limit), but the capital-efficiency difference is real: earned funding is redeployable every hour instead of sitting idle for up to 8 — 24 reinvestment windows per day vs. 3. Osprey's regime signals and entry logic recalculate every minute to align with the 60-minute epoch.

## Rate tier system

```ts
RATE_TIERS = {
  subThreshold: 0.00005,   // 0.005%/hr — floor for consideration
  core:         0.0001,    // 0.010%/hr — steady positive carry
  elevated:     0.0002,    // 0.020%/hr — elevated rates
  hot:          0.0005,    // 0.050%/hr — hot regime
  exit:         0.00003,   // 0.003%/hr — exit threshold
}
```

### Threshold history

The original entry threshold was 0.04%/hr — the HOT regime boundary. The system only entered when the market was already hot, two to four hours into an elevated episode, capturing the tail rather than the body. The corrected 0.005%/hr threshold enters during the steady-state positive carry that persists for weeks.

```text
Old classification (conflicting):        New classification:
HOT:     rate > 0.04%/hr  == entry       HOT:     rate > 0.05%/hr   (10× entry threshold)
NEUTRAL: rate > 0.01%/hr                 NEUTRAL: rate > 0.005%/hr  (harvest active)
COLD:    rate ≤ 0.01%/hr                 COLD:    rate ≤ 0.005%/hr  (pause new entries)
```

## Wallet and signing architecture

Three signing modes:

- **Browser wallet (EIP-1193)** — any injected wallet (MetaMask, Coinbase, Brave, Rainbow). Manual popup per order; not suitable for automation.
- **WalletConnect v2** — mobile and hardware wallets via QR. Same popup requirement.
- **Agent Key** — a secondary EOA authorized by the main account to sign trading orders. Cannot withdraw. Requires no browser. This is the correct approach for automated harvesting.

### Agent Key authorization flow

```text
1. User generates fresh EOA → agent key address
2. User signs approveAgent with main wallet (once)
3. HL records authorization on-chain
4. All subsequent orders signed by agent key via ethers.Wallet
5. No MetaMask, no popup, no user interaction required
```

### Signer abstraction

```ts
// apps/web/src/api/signing.ts
buildSigner({ mode: 'agentKey',      privateKey })  // → ethers.Wallet
buildSigner({ mode: 'browser',       provider })    // → BrowserProvider.getSigner()
buildSigner({ mode: 'walletconnect', provider })    // → BrowserProvider.getSigner()
```

All three implement `signTypedData` — the HL signing interface. `signHyperliquidAction` in `hyperliquid.ts` accepts any `ethers.Signer`.

## Portfolio construction

`engine/portfolio.ts` implements greedy capital allocation across all qualifying pairs. Constraints applied per pair (all must pass):

1. `budgetRemaining > minPositionUSDC × 2`
2. `totalCapital ≤ maxPairPortfolioPct × totalCapitalUSDC` (5% for tail pairs, 20% for BTC/ETH)
3. `totalCapital ≤ maxPairOIPercent × pair.openInterest` (0.5% of OI)
4. `totalCapital ≤ maxPositionUSDC × 2` (hard cap per pair)

Scoring:

```ts
score = (currentRate × 10000 + log10(OI) / 10 + heatScore / 10) × categoryPenalty
// TradFi pairs: 0.8× penalty (lower OI, more basis risk)
// HIP-3 pairs:  0.7× penalty (custom fee structure)
```

## Position lifecycle

```text
SCANNING → ENTERING → ACTIVE → REBALANCING → ACTIVE
               ↓          ↓                      ↓
              ERROR    EXITING ←─────────────────┘
```

- **ENTERING** — both perp and spot orders placed. If spot fails, the perp is emergency-closed via `Ioc`. Never leaves a naked short open.
- **ACTIVE** — funding accrual tracked from HL's `cumFunding.sinceOpen` in account state.
- **REBALANCING** — triggered when `abs((currentPrice − entryPrice) / entryPrice) > rebalanceThreshold`. Spot leg adjusted to restore the 1:1 hedge ratio; the perp continues running.
- **EXITING** — legs closed with the perp sized from live HL account state (never guessed from local notional). Failed closes leave the position open for retry next cycle.

## File map

As of the [API/SDK monorepo restructure](./docs/architecture/api-sdk.md), the portable engine, HL API client, and types live in `packages/engine/`, decoupled from the React app.

```text
packages/engine/src/
├── engine/
│   ├── harvest.ts        # core cycle: entries, exits, rotations, circuit breaker
│   ├── portfolio.ts      # multi-pair sizing: OI caps, tier allocation
│   ├── deltaHedge.ts     # spot hedge management, drift + rebalancing
│   ├── regime.ts         # HOT/NEUTRAL/COLD detection, rotation cost/benefit
│   └── signals.ts        # per-pair ENTER/WAIT/EXIT signal logic
├── api/
│   ├── hyperliquid.ts    # HL REST API: rates, candles, account state, orders
│   └── fees.ts           # dynamic fee fetching and calculations
├── signing.ts            # portable agent-key primitives (no browser APIs)
└── types/                # canonical account/harvest/funding/position shapes

apps/web/src/
├── engine/HarvestService.tsx   # React service component — drives the cycle on rate updates
├── api/
│   ├── signing.ts              # browser wallet signing + agent-key encryption at rest
│   └── walletConnect.ts        # WalletConnect v2 integration
├── store/
│   ├── harvestStore.ts         # engine state + order execution orchestration
│   ├── positionStore.ts        # positions + trades (persisted to localStorage)
│   ├── scannerStore.ts         # rate polling, pair metadata
│   ├── appStore.ts             # wallet, regime, app-level state
│   ├── feeStore.ts             # dynamic fee tier caching
│   └── equityCurveStore.ts     # in-memory portfolio equity history
├── hooks/                      # useWallet, useFees, useStartupReconciliation, …
└── pages/                      # Scanner, Harvest, Portfolio, Analytics, PairDetail, Settings
```

## Fee system

Hyperliquid fees are not static. They depend on:

1. **14-day rolling weighted volume** — 7 tiers (0–6), updated daily at UTC midnight
2. **HYPE staking** — 5–40% discount (Wood → Diamond tier)
3. **Maker volume share** — rebates up to −0.003% for >3% of total maker volume
4. **Asset category** — HIP-3 in growth mode: 90% fee reduction
5. **Spot quote type** — aligned quotes: 20% taker reduction
6. **Builder codes** — additional fee on top (Osprey charges none)

The perp and spot legs have different fee schedules (base Tier 0: perp 0.045%/0.015% taker/maker, spot 0.070%/0.040%). Nothing is hardcoded in trading logic — `getFees()` resolves the user's live rates, with Tier 0 base rates as the fallback when no wallet is connected or the fetch fails.

### Fee pipeline

```text
Wallet connects
  └→ appStore.setWallet({ connected: true })
      └→ useFeeStore.fetchFees(address)           ← POST /info { type: 'userFees' }
          └→ stores OspreyFees in feeStore
              ├→ harvestStore uses live rates for P&L and rotation cost
              └→ EntryModal uses fees for round-trip display

Refresh:  every 24h (fee tiers update daily at UTC midnight)
Fallback: HL Tier 0 base rates when not connected or fetch fails
```

| File | Role |
|---|---|
| `packages/engine/src/api/fees.ts` | Fee fetch, tier tables, break-even math, display helpers |
| `apps/web/src/store/feeStore.ts` | Zustand store — caches live fees, handles refresh |
| `apps/web/src/hooks/useFees.ts` | React hook — auto-fetches on wallet connect |

### Round-trip fees and break-even

```text
$1,000 delta-neutral position at Tier 0 (base, no discount):

Entry (both legs, Alo maker):          Exit (both legs, Ioc taker):
  Perp = $500 × 0.015% = $0.075          Perp = $500 × 0.045% = $0.225
  Spot = $500 × 0.040% = $0.200          Spot = $500 × 0.070% = $0.350

Round-trip total = $0.850
Funding at 0.010%/hr on $500 perp notional = $0.05/hr
Break-even = $0.850 / $0.05 = 17 hours
```

With Tier 3 volume ($100M) plus Silver staking (15% discount), the round-trip drops to roughly $0.43 and break-even to ~8.6 hours — a Tier 3 user breaks even twice as fast as Tier 0. This is why live fees matter.
