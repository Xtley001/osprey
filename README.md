# 🦅 OSPREY — Hyperliquid Funding Rate Intelligence

> Delta-neutral funding rate harvesting dashboard for Hyperliquid perpetuals.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
# → http://localhost:5173
```

## What it does

- **Scanner** — Live heatmap of all HL funding rates (crypto + TradFi: NVDA, AAPL, GOOGL, GOLD…)
- **Backtester** — Replay any strategy on historical funding rate data
- **Regime Detection** — HOT / NEUTRAL / COLD macro state with breadth indicator
- **Rotation Engine** — Auto-identifies best pair to hold each hourly interval
- **Demo Mode** — Paper trading with real live data, no wallet needed
- **Real Mode** — MetaMask connect → live Hyperliquid orders
- **Portfolio** — Track open positions, funding earned, net PnL

## Deploy

```bash
# Vercel (recommended)
npm i -g vercel && vercel --prod

# Or Cloudflare Pages
# Build command: npm run build   Output dir: dist
```

## Key facts

- HL pays funding **every 1 hour** (not 8h like Binance/Bybit) — Osprey is built around this
- All rates shown as hourly % with 8h equivalent for comparison
- Demo mode uses real live HL data — safe to test without capital
- Never stores private keys — signing happens in MetaMask

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm test` | Run unit tests |

---

*Osprey dives when the rate is right.*
