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
- IOC (immediate-or-cancel) order type — market-like execution

**Requires manual step:**
- Spot hedge leg — HL's spot market doesn't cover all perp pairs. Execute on HL spot or a CEX.

**Label:**
- Live trading is marked **Beta** in the UI — test on HL testnet before using real capital.

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

## Fee accuracy

The 0.035% taker fee shown throughout the app is Hyperliquid's actual current fee.
Break-even calculations use this real rate.

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

---

*Osprey dives when the rate is right.*
