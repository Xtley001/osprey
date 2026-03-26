# 🦅 Osprey

**Delta-neutral funding rate harvesting for Hyperliquid.**

Osprey is a professional trading dashboard that identifies elevated funding rate opportunities on Hyperliquid, simulates strategies historically, and executes delta-neutral positions — either in a sandboxed demo account or against a live Hyperliquid wallet.

---

## What Osprey does

Hyperliquid pays funding every **1 hour** (not every 8 hours like Binance or Bybit). When a pair's funding rate is elevated, holding a short perpetual + long spot earns that rate every hour while remaining price-neutral — you don't care if the price goes up or down.

Osprey automates the entire workflow:

1. **Scanner** — live heatmap of all Hyperliquid funding rates, including TradFi pairs (NVDA, AAPL, GOOGL, GOLD, WTIOIL, SPACEX)
2. **Regime detection** — HOT / NEUTRAL / COLD market state based on the top 20 pairs by OI
3. **Entry signals** — ENTER / WAIT / EXIT / AVOID per pair, based on rate persistence
4. **Position sizing** — configurable 5–100% of balance with live fee/break-even preview
5. **Backtester** — replay any strategy on historical rate data with equity curve, Sharpe, drawdown
6. **Demo mode** — paper trading using live rate data, no capital required
7. **Live mode** — real orders via MetaMask, signed locally, submitted to Hyperliquid

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

## Install as an app (PWA)

Osprey is a Progressive Web App. Once deployed, you can install it from Chrome:

1. Open Osprey in Chrome
2. Click the install icon in the address bar (or the install banner in the app)
3. Osprey opens as a standalone window and stays accessible like a desktop app

This matters for a trading tool — you want it running persistently, not buried in a browser tab.

---

## Live trading setup

1. Deposit USDC to your Hyperliquid account at [app.hyperliquid.xyz](https://app.hyperliquid.xyz)
2. Open Osprey → Settings → Connect MetaMask
3. Osprey fetches your real HL balance and displays it
4. Switch to Live mode in the sidebar
5. Click Enter on any pair in the Scanner — a position modal opens with your real balance, a size slider, and a confirmation checkbox
6. MetaMask signs the order locally and submits it to HL

**Your private key never leaves MetaMask.** Osprey never has custody.

---

## How the strategy works

```
Entry:  Rate > threshold for ≥ 2 consecutive hours
Hold:   Short perp + Long spot (delta-neutral — price moves cancel out)
Exit:   Rate drops below exit threshold OR max hold time reached

Earnings:  funding_rate × notional × hours_held
Cost:      (entry_fee + exit_fee) × notional = 0.07% round-trip at HL taker rate
Break-even: fees / hourly_income = typically 2–5 hours at elevated rates
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| State | Zustand |
| Data | Hyperliquid REST API (live) + mock fallback |
| Signing | MetaMask via ethers v6 |
| Charts | Canvas API (custom) |
| Deployment | Vercel / Cloudflare Pages |
| PWA | Service Worker + Web App Manifest |

---

## Deploy

```bash
# Vercel (recommended — free, zero spin-down, auto-deploy on push)
npm i -g vercel && vercel --prod

# Cloudflare Pages
# Build: npm run build  |  Output: dist
```

Add `_redirects` to `public/` for Cloudflare SPA routing:
```
/*  /index.html  200
```

---

## Development

```bash
npm run dev          # dev server → localhost:5173
npm run build        # production build
npm run typecheck    # TypeScript check
npm test             # 37 unit tests
npm run test:watch   # watch mode
npm run test:coverage # coverage report
```

See [SETUP.md](./SETUP.md) for full environment setup, git workflow, and deployment guide.
See [TESTING.md](./TESTING.md) for test documentation.

---

## Honest limitations (pre-launch)

- **Live orders**: The MetaMask signing flow is implemented. Hyperliquid order submission works for simple market orders. Complex order types (TWAP, post-only, reduce-only) are not yet implemented.
- **Spot hedge**: The spot leg of the delta-neutral trade is not yet auto-executed (HL spot markets are limited). The UI shows the instruction; execution is manual.
- **Persistence**: Positions are held in browser memory (Zustand). Closing the browser clears them. The PWA install improves this, but a proper backend with database persistence is the full solution.
- **Backtester data**: When the HL API is unreachable, the backtester uses synthetic data with realistic rate distributions. Real historical data is used when available.

---

## Roadmap

- [ ] Backend service (Node.js) for persistent positions, alerts, and rate history caching
- [ ] Spot hedge auto-execution via HL spot API
- [ ] Telegram / email alerts for regime shifts and rate spikes
- [ ] Multi-account support
- [ ] Mobile-optimised layout
- [ ] Rotation strategy backtesting (already specced in engine)

---

*Osprey dives when the rate is right.*
