<div align="center">

<img src="public/osprey-icon.svg" width="72" height="72" alt="Osprey" />

# Osprey

**Delta-neutral funding rate harvesting for Hyperliquid**

[![Live](https://img.shields.io/badge/live-osprey--three.vercel.app-00d4aa?style=flat-square)](https://osprey-three.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-71%20passing-22c55e?style=flat-square)](./engine-tests)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square)](./LICENSE)

Osprey scans every Hyperliquid perpetual every minute, scores funding rate opportunities, and executes delta-neutral positions via MetaMask — in demo or live mode.

[**Try it live →**](https://osprey-three.vercel.app/)

</div>

---

## What is this?

Hyperliquid pays funding **every hour** (vs. every 8h on Binance/Bybit). When a pair's funding rate is elevated, shorting the perpetual and going long spot earns that rate every hour — with zero directional exposure. You don't care if the price goes up or down.

Osprey automates the entire decision workflow: scan → signal → size → execute.

---

## Features

| | Feature | Description |
|---|---|---|
| 📡 | **Live Scanner** | Real-time heatmap of all HL funding rates — crypto + TradFi (NVDA, AAPL, GOLD, SPACEX, WTIOIL) |
| 🧠 | **Regime Detection** | HOT / NEUTRAL / COLD market signal derived from top-20 OI-weighted pairs |
| 🎯 | **Entry Signals** | ENTER / WAIT / EXIT / AVOID per pair, requiring rate persistence before triggering |
| 📐 | **Position Sizing** | 5–100% of balance slider with live fee preview, break-even calc, and hourly income estimate |
| 📊 | **Backtester** | Replay any strategy on 180 days of real HL historical data |
| 🤖 | **Auto-Trader** | Automated cycle engine — scans, enters, rotates, and exits based on your config |
| 🧪 | **Demo Mode** | Full paper trading with live rate data. No wallet, no capital required |
| ⚡ | **Live Mode** | Real orders via MetaMask, EIP-712 signed locally, submitted to Hyperliquid |

---

## Quick Start

```bash
git clone https://github.com/Xtley001/osprey.git
cd osprey
npm install
cp .env.example .env.local
npm run dev
```

Opens at `http://localhost:5173`. Demo mode works immediately — no wallet or API key needed.

---

## Live Trading Setup

> **Test on HL testnet with minimum size before deploying real capital.**

1. Deposit USDC at [app.hyperliquid.xyz](https://app.hyperliquid.xyz)
2. Open Osprey → **Settings** → Connect MetaMask
3. Osprey fetches your real HL balance automatically
4. Switch the sidebar to **Live** mode
5. Click **Enter** on any pair — modal shows real balance, size, fees, and break-even
6. MetaMask prompts for signature → order submitted to HL

> Your private key never leaves MetaMask. Osprey only receives the signed payload.

---

## Fee Model

Osprey v18 uses minimum-fee order routing by default.

| Leg | Order Type | HL TIF | Fee | Per $5k notional |
|-----|-----------|--------|-----|-----------------|
| Entry | Post-only limit | `Alo` | **0.010%** (maker) | $0.50 |
| Exit | Immediate-or-cancel | `Ioc` | 0.035% (taker) | $1.75 |
| Rebalance | Immediate-or-cancel | `Ioc` | 0.035% × drift notional | variable |

**Round-trip saving vs. v17 (both legs taker):**

```
v17:       $1.75 + $1.75 = $3.50  per round-trip on $5k
v18:       $0.50 + $1.75 = $2.25  per round-trip on $5k  →  −36%
Best case: $0.50 + $0.50 = $1.00  per round-trip on $5k  →  −71%
```

Entry orders use `Alo` (post-only). If rejected by the matching engine — e.g. during a fast market move — Osprey automatically retries with `Ioc`. Fills are never missed.

### Volume-Based Tiers

| 30d Volume | Maker | Taker |
|-----------|-------|-------|
| Default | 0.010% | 0.035% |
| ≥ $5M | 0.008% | 0.030% |
| ≥ $25M | 0.005% | 0.025% |
| ≥ $100M | 0.002% | 0.020% |

Update `DEFAULT_STRATEGY.takerFee` and `DEFAULT_STRATEGY.makerFee` in `src/utils/constants.ts` to match your tier — the backtester and all fee previews update automatically.

---

## How Trading Works

Osprey is **semi-automated by design** — you confirm every live trade.

```
Scanner detects elevated rate + ENTER signal
        ↓
  Click Enter on pair
        ↓
  Modal: size · fees · break-even · hourly income
        ↓
  Confirm → MetaMask signs → order sent to HL
        ↓
  Manually execute spot hedge (HL spot or CEX)
```

The Auto-Trader runs a cycle every 60 seconds in demo mode with no confirmation needed. In live mode it submits real orders — enable only when you understand the strategy.

---

## Architecture

```
src/
├── api/
│   └── hyperliquid.ts      ← HL REST client, EIP-712 signing, order placement
├── engine/
│   ├── autotrader.ts       ← cycle engine: enter/exit/rotate decision logic
│   ├── backtester.ts       ← hourly simulation over historical funding + OHLCV
│   ├── regime.ts           ← HOT/NEUTRAL/COLD market regime classifier
│   └── signals.ts          ← per-pair ENTER/WAIT/EXIT/AVOID signal generator
├── store/
│   ├── appStore.ts         ← wallet, mode, regime state
│   ├── autoTraderStore.ts  ← auto-trader config + cycle runner
│   ├── positionStore.ts    ← open positions (demo + live)
│   └── scannerStore.ts     ← live funding rate cache
├── pages/                  ← Scanner · PairDetail · Backtester · Portfolio · Analytics · Settings
├── components/             ← EntryModal · PositionTicker · AutoTraderService · …
└── types/                  ← TypeScript interfaces for all domain objects
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript (strict) | Fast dev, strict types |
| State | Zustand | Lightweight, no boilerplate |
| Data | Hyperliquid REST API | Live rates, history, account state |
| Signing | MetaMask + ethers v6 | EIP-712-variant, no key exposure |
| Charts | Canvas API (custom) | Zero lib overhead |
| Testing | Vitest — 71 unit tests | Engine + math + utilities |
| PWA | Service Worker + Web App Manifest | Installable, offline-capable |
| Deployment | Vercel | Zero config, instant deploys |

---

## Development

```bash
npm run dev           # dev server → localhost:5173
npm run build         # production build
npm run typecheck     # tsc --noEmit (0 errors enforced)
npm test              # vitest run — 71 tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

See [SETUP.md](./SETUP.md) and [TESTING.md](./TESTING.md) for full details.

---

## Deploy Your Own

```bash
npm i -g vercel
vercel --prod
```

`vercel.json` SPA rewrites are pre-configured. No extra setup needed.

---

## Known Limitations

| Limitation | Status |
|---|---|
| Spot hedge auto-execution | Manual — HL spot doesn't cover all perp pairs. Use HL spot or a CEX for the long leg |
| Position persistence | In-browser memory only — closing the tab clears positions. PostgreSQL backend is v2 |
| Mobile trading flow | Functional but optimised for desktop |

---

## Roadmap

- [ ] PostgreSQL backend — persistent positions across sessions and devices
- [ ] Telegram / email alerts on ENTER signals for watchlisted pairs
- [ ] Testnet toggle in UI
- [ ] Per-pair spot hedge instructions (which exchange, which instrument)
- [ ] Semi-automated rotation via Telegram approval flow
- [ ] GTC limit exit orders for full maker round-trips (−71% fee vs v17)
- [ ] Per-account fee tier auto-detection from HL user state API
- [ ] Mobile-optimised entry flow

---

## Contributing

PRs welcome. Please run `npm run typecheck && npm test` before opening a pull request. See [TESTING.md](./TESTING.md) for the test conventions used in this repo.

---

<div align="center">

*Osprey dives when the rate is right.*

</div>
