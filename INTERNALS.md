# Osprey — Architecture & Internals

> Current commit · Post-audit architecture · April 2026

---

## System overview

Osprey is a **perpetual funding rate harvesting system** on Hyperliquid. It opens delta-neutral positions (short perp + long spot hedge) across as many qualifying pairs as available margin allows, collecting funding payments every hour while maintaining near-zero directional exposure.

It is not a directional trader. It is not a spike chaser. It is a systematic yield engine.

---

## Core invariant: delta neutrality

Every position **must** have both legs:

```
Short perp  → captures the funding premium embedded in the perpetual
Long spot   → cancels directional exposure (price moves cancel out)
```

If only the perp leg is placed, the position is a **naked short**. When price moves against it, capital bleeds. The whole premise of funding harvesting — direction-agnosticism — requires the spot hedge.

The `deltaHedge.ts` module tracks hedge drift and triggers rebalancing when drift exceeds the configured threshold.

---

## Data flow

```
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

---

## Financial formulas

### Funding earned per hour

```
gross_per_hour = perp_notional × funding_rate_hr
              = (capital_per_pair / 2) × rate
```

Only the perp notional earns funding. The spot leg earns zero funding — it is a pure hedge.

### Simple APY projection

```
simple_APY = rate_per_hour × 8760
```

Used for live rate display. Clearly labeled "Simple APY (snapshot)" — the rate changes hourly, so projection is illustrative only.

### Backtester annualized return

```
simple_annualized = (total_return_pct / days_in_backtest) × 365

CAGR = (final_equity / initial_capital)^(1 / years) - 1
```

Both are shown. CAGR is the gold standard for backtester output.

### Sharpe ratio (corrected)

```
hourly_returns[]  = equity_curve[i].equity / equity_curve[i-1].equity - 1
rf_hourly         = 0.05 / 8760   (5% annual risk-free rate)
excess[]          = hourly_returns - rf_hourly
sharpe_annualized = mean(excess) / std(excess) × sqrt(8760)
```

The previous formula computed Sharpe on per-trade returns (scaled by `sqrt(8760 / avgHoldHours)`), which overstates Sharpe when trades are short and understates it for long-duration positions. Hourly equity curve returns are statistically cleaner and industry-standard for continuous strategies.

### Fee model (corrected)

```
perp_notional  = capital_per_pair / 2
spot_notional  = capital_per_pair / 2

entry_fees = perp_notional × maker_fee + spot_notional × maker_fee
           = capital_per_pair × maker_fee

exit_fees  = perp_notional × taker_fee + spot_notional × taker_fee
           = capital_per_pair × taker_fee

round_trip = capital_per_pair × (maker_fee + taker_fee)
           = $1,000 × (0.010% + 0.035%) = $0.45
```

The old code used `capitalUSDC` (not `/2`) as fee base per leg — overstating fees by 2×. Corrected to `capitalUSDC / 2` per leg.

---

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

### Old thresholds and why they were wrong

```
Old entry:  0.04%/hr  == HOT regime boundary
```

This meant the system only entered when the market was already classified as HOT. That's two to four hours into an elevated episode — capturing the tail, not the body. The corrected 0.005%/hr threshold enters during the steady-state positive carry that persists for weeks.

### Regime alignment (fixed)

Old classification:
```
HOT:     rate > 0.04%/hr   ← same as entry threshold (conflict!)
NEUTRAL: rate > 0.01%/hr
COLD:    rate ≤ 0.01%/hr
```

New classification:
```
HOT:     rate > 0.05%/hr   ← 10× entry threshold (no conflict)
NEUTRAL: rate > 0.005%/hr  ← above entry threshold (harvest active)
COLD:    rate ≤ 0.005%/hr  ← pause new entries
```

---

## Wallet and signing architecture

### Three signing modes

1. **Browser wallet (EIP-1193)** — Any injected wallet (MetaMask, Coinbase, Brave, Rainbow). Requires manual popup per order. Not suitable for automation.

2. **WalletConnect v2** — Mobile wallets and hardware wallets via QR. Same popup requirement as browser wallets.

3. **Agent Key** — A secondary EOA authorized by the main account to sign trading orders. Cannot withdraw. Requires no browser. This is the correct approach for automated harvesting.

### Agent Key authorization flow

```
1. User generates fresh EOA → agent key address
2. User signs approveAgent with main wallet (once)
3. HL records authorization on-chain
4. All subsequent orders signed by agent key via ethers.Wallet
5. No MetaMask, no popup, no user interaction required
```

### Signer abstraction

```ts
// api/signing.ts
buildSigner({ mode: 'agentKey',    privateKey })  → ethers.Wallet
buildSigner({ mode: 'browser',     provider })    → BrowserProvider.getSigner()
buildSigner({ mode: 'walletconnect', provider })  → BrowserProvider.getSigner()
```

All three implement `signTypedData` — the HL signing interface. The `signHyperliquidAction` function in `hyperliquid.ts` accepts any `ethers.Signer`.

---

## Portfolio construction

`engine/portfolio.ts` implements greedy capital allocation across all qualifying pairs.

**Constraints applied per-pair (all must pass):**
1. `budgetRemaining > minPositionUSDC × 2`
2. `totalCapital ≤ maxPairPortfolioPct × totalCapitalUSDC` (5% for tail pairs, 20% for BTC/ETH)
3. `totalCapital ≤ maxPairOIPercent × pair.openInterest` (0.5% of OI)
4. `totalCapital ≤ maxPositionUSDC × 2` (hard cap per pair)

**Scoring function:**
```ts
score = (currentRate × 10000 + log10(OI) / 10 + heatScore / 10) × categoryPenalty
```

TradFi pairs: 0.8× penalty (lower OI, more basis risk)
HIP-3 pairs:  0.7× penalty (custom fee structure)

---

## Position lifecycle state machine

```
SCANNING → ENTERING → ACTIVE → REBALANCING → ACTIVE
               ↓          ↓                      ↓
              ERROR    EXITING ←─────────────────┘
```

**ENTERING:** Both perp and spot orders placed. If spot fails, perp is emergency-closed via `Ioc` order. Never leaves a naked short open.

**ACTIVE:** `cumFunding.sinceOpen` polled from HL account state every 30 minutes (real). Hourly simulation for demo positions.

**REBALANCING:** Triggered when `abs((currentPrice - entryPrice) / entryPrice) > rebalanceThreshold`. Spot leg adjusted to restore 1:1 hedge ratio. Perp continues running.

**EXITING:** Both legs closed concurrently via `Promise.allSettled`. If one leg fails, position transitions to ERROR and alerts the user.

---

## File map (current)

```
src/engine/
  harvest.ts          ← Core cycle (was autotrader.ts)
  portfolio.ts        ← Multi-pair sizing (new)
  deltaHedge.ts       ← Spot hedge management (new)
  backtester.ts       ← Corrected fee model, CAGR, Sharpe
  regime.ts           ← Updated thresholds (no boundary conflict)
  signals.ts          ← Per-pair signal logic (unchanged)
  HarvestService.tsx  ← React service component (was AutoTraderService)

src/store/
  harvestStore.ts     ← Engine state (was autoTraderStore.ts)
  positionStore.ts    ← Position + trade tracking
  scannerStore.ts     ← Rate polling
  appStore.ts         ← App-level state

src/api/
  hyperliquid.ts      ← HL REST API
  signing.ts          ← Signer abstraction (new)
  walletConnect.ts    ← WalletConnect v2 (new)

src/hooks/
  useWallet.ts        ← Unified wallet hook (new)

src/types/
  harvest.ts          ← Engine types (was autotrader.ts)
  portfolio.ts        ← Portfolio types (new)
  wallet.ts           ← Wallet/signer types (new)
```

---

## Removed files

| File | Reason |
|------|--------|
| `deploy-v19.sh` | Versioned deploy script — exposes infrastructure, replaced by CI |
| `docs/index.html` | 51KB duplicate of React app |
| `MARKET-ANALYSIS.md` | Speculative content — replaced by STRATEGY.md |
| `src/pages/AutoTrader.tsx` | Renamed to Harvest.tsx |
| `src/store/autoTraderStore.ts` | Renamed to harvestStore.ts |
| `src/engine/autotrader.ts` | Renamed to harvest.ts |
| `src/types/autotrader.ts` | Renamed to harvest.ts |
| `src/components/shared/AutoTraderService.tsx` | Moved to engine/HarvestService.tsx |

---

## Fee system — why nothing is hardcoded

Hyperliquid fees are **not static**. They depend on:

1. **14-day rolling weighted volume** — 7 tiers (0–6), updated daily at UTC midnight
2. **HYPE staking** — 5–40% discount (Wood → Diamond tier)
3. **Maker volume share** — rebates up to −0.003% for >3% of total maker volume
4. **Asset category** — HIP-3 in growth mode: 90% fee reduction
5. **Spot quote type** — aligned quotes: 20% taker reduction
6. **Builder codes** — additional fee on top (Osprey charges none)

Different legs have **different fee schedules**:
- Perp leg: perp fee schedule (base Tier 0: 0.045% taker, 0.015% maker)
- Spot leg: spot fee schedule (base Tier 0: 0.070% taker, 0.040% maker)

### Fee pipeline

```
Wallet connects
  └→ appStore.setWallet({ connected: true })
      └→ useFeeStore.fetchFees(address)           ← POST /info { type: 'userFees' }
          └→ stores OspreyFees in feeStore
              ├→ harvestStore uses fees.perpTaker, fees.spotTaker for P&L
              ├→ FeeDisplay renders tier badge + break-even
              ├→ Backtester seeds takerFee/makerFee from feeStore via useEffect
              └→ EntryModal uses fees for round-trip display

Fees refresh: every 24h (fee tiers update daily at UTC midnight)
Fallback: HL Tier 0 base rate when not connected or fetch fails
```

### Key files

| File | Role |
|------|------|
| `src/api/fees.ts` | Fee fetch, tier tables, break-even math, display helpers |
| `src/store/feeStore.ts` | Zustand store — caches live fees, handles refresh |
| `src/hooks/useFees.ts` | React hook — auto-fetches on wallet connect |
| `src/components/shared/FeeDisplay.tsx` | UI widget — renders live tier + break-even |

### Round-trip fee formula

```
For a $1,000 delta-neutral position at Tier 0 (base, no discount):

Entry (both legs, Alo maker):
  Perp entry = $500 × 0.015% = $0.075
  Spot entry = $500 × 0.040% = $0.200
  Total entry = $0.275

Exit (both legs, Ioc taker):
  Perp exit  = $500 × 0.045% = $0.225
  Spot exit  = $500 × 0.070% = $0.350
  Total exit = $0.575

Round-trip total = $0.850

At 0.010%/hr on $500 perp notional = $0.05/hr
Break-even = $0.850 / $0.05 = 17 hours
```

Note: if the user has Tier 3 ($100M volume) + Silver staking (15% discount):
```
Perp taker = 0.030% × 0.85 = 0.0255%
Spot taker = 0.040% × 0.85 = 0.034%
Round-trip ≈ $0.43 → break-even ≈ 8.6 hours
```

This is why live fees matter. A Tier 3 user has 2× faster break-even than Tier 0.
