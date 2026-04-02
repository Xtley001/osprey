# 🦅 Osprey

**Delta-neutral funding rate harvesting for Hyperliquid.**

Osprey is a professional trading dashboard that identifies elevated funding rate opportunities
on Hyperliquid, simulates strategies historically, and executes delta-neutral positions — either
in a sandboxed demo account or against a live Hyperliquid wallet.

Live at: **https://osprey-three.vercel.app/**

---

## What it does

Hyperliquid pays funding every **1 hour** (not every 8 hours like Binance or Bybit). When a
pair's funding rate is elevated, holding a short perpetual + long spot earns that rate every
hour while remaining price-neutral — you don't care if the price goes up or down.

Osprey automates the entire intelligence workflow:

| Feature | What it does |
|---|---|
| **Scanner** | Live heatmap of all HL funding rates — crypto AND TradFi (NVDA, AAPL, GOOGL, GOLD, WTIOIL, SPACEX) |
| **Regime Detection** | HOT / NEUTRAL / COLD market signal based on top 20 pairs by OI |
| **Entry Signals** | ENTER / WAIT / EXIT / AVOID per pair, based on rate persistence |
| **Position Sizing** | 5–100% of balance slider with live fee and break-even preview |
| **Backtester** | Replay any strategy on 180 days of real historical HL data |
| **Demo Mode** | Paper trading with live rate data — no capital required |
| **Live Mode** | Real orders via MetaMask, signed locally, submitted to Hyperliquid |

---

## Does it trade automatically?

**No — and this is intentional.**

Osprey identifies opportunities and sizes positions. You confirm every trade. The flow is:

1. Scanner shows elevated rate + ENTER signal on a pair
2. Click **Enter** → modal shows size, fees, break-even, hourly income estimate
3. Confirm → Osprey submits the perp order to HL via MetaMask
4. Manually execute the spot hedge on HL or another exchange

The Rotation Engine shows which pair to move capital to — it does not auto-execute.
Fully automated execution is on the roadmap (v2: Telegram alerts, v3: semi-automated).

---

## Live trading — what actually works

**Fully working:**
- MetaMask connect with real Hyperliquid address
- Real balance fetch from HL's `clearinghouseState` API after connect
- Order submission to HL `/exchange` with correct EIP-712-variant signing
- Correct asset index lookup from HL's universe (not hardcoded)
- **Post-only (Alo) order type by default** — maker fee (0.010%) instead of taker (0.035%)
- Automatic Alo → Ioc fallback if the post-only order would cross the book

**Requires manual step:**
- Spot hedge leg — HL's spot market doesn't cover all perp pairs. Execute on HL spot or a CEX.

**Label:**
- Live trading is marked **Beta** in the UI — test on HL testnet before using real capital.

---

## Fee model (v18)

Osprey now uses the minimum-fee order routing strategy on Hyperliquid:

| Leg | Order type | HL TIF | Fee rate | Per $5k notional |
|-----|-----------|--------|----------|-----------------|
| Entry | Post-only limit | `Alo` | **0.010%** (maker) | $0.50 |
| Exit | Immediate-or-cancel | `Ioc` | 0.035% (taker) | $1.75 |
| Rebalance | Immediate-or-cancel | `Ioc` | 0.035% × drift notional | variable |

**Round-trip saving vs. previous (both legs taker):**

```
Before (v17): $1.75 + $1.75 = $3.50 per round-trip on $5k
After  (v18): $0.50 + $1.75 = $2.25 per round-trip on $5k  → −36%
```

If both legs can be maker (e.g. patient exit via GTC limit):

```
Best case:    $0.50 + $0.50 = $1.00 per round-trip on $5k  → −71%
```

### How it works

`placeMarketOrder()` in `src/api/hyperliquid.ts` accepts an optional `tif` parameter:

```ts
// Default: post-only maker (0.010% fee)
await placeMarketOrder({ coin, isBuy, sz, px, address, provider });

// Explicit taker for urgent exits (0.035% fee)
await placeMarketOrder({ coin, isBuy, sz, px, address, provider, tif: 'Ioc' });
```

The auto-trader automatically falls back from `Alo` to `Ioc` when the post-only order
would immediately cross (e.g. during a fast market move), so fills are never missed.

### Fee tiers (volume-based)

Higher volume reduces the taker leg further:

| 30d Volume | Maker | Taker |
|-----------|-------|-------|
| Default   | 0.010% | 0.035% |
| ≥ $5M     | 0.008% | 0.030% |
| ≥ $25M    | 0.005% | 0.025% |
| ≥ $100M   | 0.002% | 0.020% |

Update `DEFAULT_STRATEGY.takerFee` and `DEFAULT_STRATEGY.makerFee` in
`src/utils/constants.ts` when your account reaches a higher tier. The backtester
and all fee previews will update automatically.

### Backtester fee accuracy

The backtester (v18) correctly models:
- **Entry fee** = `capitalUSDC × makerFee` (Alo post-only)
- **Exit fee** = `capitalUSDC × takerFee` (Ioc taker)
- **Rebalance fee** = `driftNotional × takerFee` (based on actual drift %, not a fixed heuristic)

Previously all legs used `takerFee`, making backtest P&L 36% more pessimistic than reality.

---

## Quick start

```bash
git clone https://github.com/Xtley001/osprey.git
cd osprey
npm install
cp .env.example .env.local
npm run dev
# → http://localhost:5173
```

Demo mode works immediately — no wallet, no signup, no API key needed.

---

## Live trading setup

1. Deposit USDC to your Hyperliquid account at [app.hyperliquid.xyz](https://app.hyperliquid.xyz)
2. Open Osprey → Settings → Connect MetaMask
3. Osprey fetches your real HL balance and displays it
4. Switch to **Live** mode in the sidebar
5. Click Enter on any pair — modal shows your real balance and position summary
6. MetaMask signs the order locally → submitted to HL

**Your private key never leaves MetaMask.**

---

## Mobile & PWA

Osprey is fully responsive:
- **Mobile (<768px)**: bottom navigation bar, positions in slide-over panel, tables scroll horizontally
- **Tablet (768–1024px)**: icon-only sidebar, positions button in topbar
- **Desktop (>1024px)**: full three-column layout

Install as a PWA from Chrome — click the install icon in the address bar. Runs as a standalone
app, no tab required.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript (strict) |
| State | Zustand with pre-computed derived state (no inline selectors) |
| Data | Hyperliquid REST API — live rates + historical + account state |
| Signing | MetaMask + ethers v6 — EIP-712-variant, correct asset index |
| Charts | Canvas API (custom, no external chart lib overhead) |
| Testing | Vitest — 37 unit tests, engine + utilities |
| PWA | Service Worker + Web App Manifest |
| Deployment | Vercel — zero config, instant deploys |

---

## Deploy your own

```bash
npm i -g vercel && vercel --prod
```

`vercel.json` SPA rewrites are pre-configured.

---

## Development

```bash
npm run dev          # dev server → localhost:5173
npm run build        # production build
npm run typecheck    # TypeScript check (0 errors)
npm test             # 37 unit tests
npm run test:watch   # watch mode
npm run test:coverage # coverage report
```

See [SETUP.md](./SETUP.md) · [TESTING.md](./TESTING.md)

---

## Current limitations (honest)

| Limitation | Status |
|---|---|
| Spot hedge auto-execution | Manual — HL spot market limited. Use HL spot or a CEX for the long leg. |
| Position persistence | Browser memory only — closing the tab clears open positions. Backend persistence is v2. |
| Rotation auto-execution | Recommendations only — does not auto-trade. |
| Testnet mode | Not yet available in UI — test on mainnet with minimum size first. |
| Mobile optimised trading | Functional but optimised for desktop workflows. |

---

## Roadmap

- [ ] Backend service (Node.js + PostgreSQL) for persistent positions across sessions
- [ ] Telegram / email alerts when ENTER signals fire on watchlisted pairs
- [ ] Testnet mode in UI
- [ ] Spot hedge instructions per pair (which exchange, which instrument)
- [ ] Semi-automated rotation (Telegram approval flow)
- [ ] Mobile-optimised entry flow
- [ ] GTC limit exit orders for full maker round-trips (−71% fee vs v17 baseline)
- [ ] Per-account fee tier config (auto-detect from HL user state API)

---

*Osprey dives when the rate is right.*
