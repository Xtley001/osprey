<div align="center">

<img src="public/osprey-icon.svg" width="80" height="80" alt="Osprey" />

# Osprey

**Delta-neutral funding rate harvesting on Hyperliquid**

[![Live](https://img.shields.io/badge/live-osprey.vercel.app-00d4aa?style=flat-square)](https://osprey-three.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-passing-22c55e?style=flat-square)](./engine-tests)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square)](./LICENSE)

Osprey scans every Hyperliquid perpetual every minute, scores funding rate opportunities, and runs a portfolio of 20–100 **delta-neutral** positions simultaneously — collecting funding payments every hour with near-zero directional exposure.

[**Try it live →**](https://osprey-three.vercel.app/) · [**Architecture →**](./INTERNALS.md) · [**Setup →**](./SETUP.md)

</div>

---

## What Osprey does

Hyperliquid pays funding **every hour** (vs. every 8h on Binance/Bybit). When a pair's funding rate is elevated, shorting the perpetual and going long spot earns that rate — with zero directional exposure. You don't care if the price goes up or down.

Osprey automates the entire workflow at portfolio scale:

| Module | What it does |
|---|---|
| **Scanner** | Live heatmap of all HL funding rates — crypto AND TradFi perps (NVDA, AAPL, GOLD, SPACEX, etc.) |
| **Harvest Engine** | Simultaneous delta-neutral positions across 20–100 qualifying pairs |
| **Portfolio Engine** | Dynamic sizing: OI caps, portfolio concentration limits, multi-tier allocation |
| **Regime Detection** | HOT / NEUTRAL / COLD signal from top-20 pairs by OI — gates new entries during cold markets |
| **Entry Signals** | ENTER / WAIT / EXIT per pair based on rate persistence and regime |
| **Backtester** | Single-pair and multi-pair portfolio replay on 180 days of real HL data |
| **Demo Mode** | Paper trading with live rate data — no capital required, clearly labelled `[DEMO]` |
| **Live Mode** | Real orders via browser wallet or Agent Key — no MetaMask required |

---

## The math — why this works

Funding harvesting is a **spread trade against time**, not a directional bet.

```
Entry:    SELL BTC-PERP (captures funding)  +  BUY BTC-SPOT (delta hedge)
Exit:     BUY  BTC-PERP (close short)       +  SELL BTC-SPOT (close hedge)

P&L:      funding earned − round-trip fees
Exposure: ~zero (spot and perp move together)
```

### Yield projection at scale

| Capital | Pairs | Avg Rate | Perp Notional | Funding/day | Net APY |
|---------|-------|----------|---------------|-------------|---------|
| $10,000 | 20    | 0.010%/hr | $5,000       | $12.00      | ~43%    |
| $50,000 | 50    | 0.010%/hr | $25,000      | $60.00      | ~43%    |
| $250,000| 100   | 0.010%/hr | $125,000     | $300.00     | ~43%    |

> APY scales linearly with positions. Osprey targets the **steady-state** 0.005–0.020%/hr range that persists for weeks — not the 0.04%+ spikes that last hours.

### Break-even analysis

```
Round-trip fees per $1,000 position:
  Perp entry (maker):  $500 × 0.010% = $0.05
  Spot entry (maker):  $500 × 0.010% = $0.05
  Perp exit (taker):   $500 × 0.035% = $0.175
  Spot exit (taker):   $500 × 0.035% = $0.175
  Total:               $0.45

At 0.010%/hr on $500 perp notional:
  Funding/hr = $0.05 → break-even in 9 hours
  At avg hold of 5–30 days → fees < 1% of gross ✓
```

---

## Performance & Fee Model

### Fee optimisation

Osprey defaults to post-only (Alo) order routing on all executions.

| Order Type  | Fee    | $5k Round-Trip Cost |
|-------------|--------|----------------------|
| Alo (maker) | 0.010% | $2.25               |
| IoC (taker) | 0.035% | $3.50               |
| **Savings** | -      | **$1.25 / 36%**     |

At 1,000 executions: $1,250 recovered from order type selection alone.

Fallback logic: if an order would cross the book (spread is thin), Osprey falls back to IoC to avoid post-only rejection. This matters most during HOT regimes when spreads compress.

### Why hourly settlement matters

Hyperliquid pays funding every hour. Binance pays every 8 hours.

The mathematical difference in yield from settlement frequency alone is small — both schedules converge near the same continuous-compounding limit at equal underlying rates.

The practical edge is **capital efficiency**:

- On Binance: earned funding sits idle for up to 8 hours per cycle
- On Hyperliquid: earned funding is available for redeployment every hour

At 0.05%/hr on a $10k position: ~$5/hr collected and immediately redeployable. Over a 24-hour HOT period: **24 reinvestment windows vs 3 on Binance**.

Osprey's regime signals and entry logic are built around the 60-minute epoch — recalculating every minute to align with settlement timing.

### Regime detection (v18 vs v17)

| Version | Approach | Result |
|---------|----------|--------|
| v17 | Magnitude-only scoring | Chased spikes; high false-positive rate |
| v18 | Persistence x magnitude | ~40% of marginal entries filtered out |

v18 uses a 30-day rolling mean across the top 20 OI-weighted pairs to set the regime baseline. HOT threshold = 2 standard deviations above mean.

---

## Architecture

```
src/
├── engine/
│   ├── harvest.ts        ← Core cycle: scan → enter → monitor → exit
│   ├── portfolio.ts      ← Multi-pair sizing: OI caps, tier allocation
│   ├── deltaHedge.ts     ← Spot hedge leg management and drift tracking
│   ├── backtester.ts     ← Single-pair + portfolio backtest engine
│   ├── regime.ts         ← HOT/NEUTRAL/COLD market regime detection
│   ├── signals.ts        ← Per-pair ENTER/WAIT/EXIT signal logic
│   └── HarvestService.tsx← Mounts in AppShell, drives the harvest cycle
│
├── api/
│   ├── hyperliquid.ts    ← HL REST API: rates, candles, account state, orders
│   ├── signing.ts        ← Unified signer: browser wallet / Agent Key / WalletConnect
│   └── walletConnect.ts  ← WalletConnect v2 integration
│
├── store/
│   ├── harvestStore.ts   ← Harvest engine state (config, log, P&L totals)
│   ├── positionStore.ts  ← Live position tracking and trade history
│   ├── scannerStore.ts   ← Rate polling, pair list, last-updated timestamp
│   └── appStore.ts       ← App mode, wallet state, regime cache
│
├── hooks/
│   └── useWallet.ts      ← Unified wallet: injected / WalletConnect / Agent Key
│
└── pages/
    ├── Harvest.tsx        ← Engine config + live log + position table
    ├── Scanner.tsx        ← Funding rate heatmap
    ├── Portfolio.tsx      ← Portfolio summary + pair breakdown
    ├── Backtester.tsx     ← Strategy backtester UI
    └── Settings.tsx       ← Auth, demo config, theme
```

---

## Delta-neutral position lifecycle

```
SCANNING --→ ENTERING --→ ACTIVE --→ REBALANCING --→ ACTIVE
    ↑                         │                         │
    │                         ↓                         ↓
    └──────────────── EXITING ←─────────────────────────┘
```

**Entry:** Both legs placed atomically. If spot leg fails, perp is emergency-closed. Never a naked short.

**Monitoring:** Funding accrues hourly (real: from `cumFunding.sinceOpen`; demo: simulated).

**Rebalancing:** When price drifts >10% from entry, spot notional is adjusted. Perp keeps running.

**Exit triggers (in priority order):**
1. Rate goes negative → immediate exit
2. Rate falls below 0.003%/hr exit floor → next cycle
3. Regime collapses to COLD for 3+ hours → exit all
4. Max hold time (30 days default) → force exit
5. Manual → immediate

---

## Wallet & auth

Osprey supports three signing modes — MetaMask is **not** required:

| Method | Best for | Autonomous? |
|--------|----------|-------------|
| Browser wallet | Manual setup, first-time users | No (popup per order) |
| WalletConnect | Mobile wallets, Ledger/Trezor | No (popup per order) |
| **Agent Key** | **Automated harvesting** | **Yes — no popups** |

### Agent Keys (recommended for automation)

An Agent Key is a secondary EOA that Hyperliquid authorizes to trade on behalf of your main account. It **cannot withdraw funds** — even if compromised, your balance is safe.

Setup flow:
1. Connect your main wallet (MetaMask or WalletConnect)
2. Osprey generates a fresh EOA as the agent key
3. You sign the `approveAgent` action once
4. All subsequent orders are signed by the agent key — no browser extension needed

```
Settings → Trading Authorization → [Generate New Agent Key]
```

---

## Rate tier system

| Tier | Rate range | Action | Notes |
|------|-----------|--------|-------|
| Sub-threshold | < 0.005%/hr | Skip | Below break-even after fees |
| **Core** | 0.005–0.020%/hr | **Enter** | Steady yield — this is where the money lives |
| Elevated | 0.020–0.050%/hr | Enter (priority) | Better yield, still persistent |
| Hot | > 0.050%/hr | Enter (max size) | High yield, monitor for reversal |
| Negative | < 0% | Exit immediately | You pay instead of receive |

The old threshold was 0.04%/hr — meaning Osprey only entered when rates were already in a spike. That captures the **tail** of each episode. The corrected 0.005%/hr threshold captures the **body** — the weeks of persistent positive carry that fund the real returns.

---

## Backtester presets

| Preset | Entry | Exit | Hold | Style |
|--------|-------|------|------|-------|
| **Conservative** | 0.010%/hr | 0.003%/hr | 30 days | Max time in market, low churn |
| Balanced | 0.020%/hr | 0.005%/hr | 7 days | Mid-tier entries, weekly cycle |
| Opportunistic | 0.050%/hr | 0.020%/hr | 2 days | Spike capture only, fast turnover |

---

## Getting started

```bash
git clone https://github.com/yourusername/osprey.git
cd osprey
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. No API key required — Osprey reads public Hyperliquid endpoints.

**For live trading:**
1. Configure wallet in Settings (any EIP-1193 wallet, WalletConnect, or Agent Key)
2. Test on HL testnet first (`VITE_ENABLE_TESTNET=true`)
3. Set `VITE_ENABLE_REAL_TRADING=true`
4. Start with small positions ($50–$100/pair) to verify execution

See [SETUP.md](./SETUP.md) for full configuration guide.

---

## Risk disclosures

1. **Smart contract risk** — Funds are in the Hyperliquid clearinghouse (sovereign L1, no custodian)
2. **Liquidation risk** — Delta-neutral positions can still be liquidated under extreme price moves
3. **Basis risk** — Spot–perp basis can temporarily widen, causing paper losses on the hedge
4. **Funding reversal** — Rates can go negative. System exits before negative rates erode principal
5. **Slippage** — Market impact on illiquid pairs. OI caps (0.5% of pair OI) limit this
6. **Agent key risk** — Compromise allows position manipulation but **not withdrawals**

**Test on testnet. Start small. Osprey is beta software.**

---

## License

MIT — see [LICENSE](./LICENSE)
