# Osprey

*Delta-neutral funding rate harvesting on Hyperliquid.*

[![Live](https://img.shields.io/badge/live-osprey.vercel.app-00d4aa?style=flat-square)](https://osprey-three.vercel.app/)
[![CI](https://img.shields.io/badge/CI-github_actions-3178c6?style=flat-square)](./.github/workflows)
[![Tests](https://img.shields.io/badge/tests-164_passing-22c55e?style=flat-square)](./TESTING.md)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square)](./LICENSE)

Osprey scans every Hyperliquid perpetual every minute, scores funding rate opportunities, and runs a portfolio of 20–100 delta-neutral positions simultaneously — collecting funding payments every hour with near-zero directional exposure. For the engine mechanics and financial math, see [INTERNALS.md](./INTERNALS.md).

## Quickstart

```bash
git clone https://github.com/Xtley001/osprey.git
cd osprey
npm install
cp apps/web/.env.example apps/web/.env
npm run dev
```

Open `http://localhost:5173`. The Scanner works immediately with no wallet or API key — it reads public Hyperliquid endpoints. Live trading requires wallet setup; see [SETUP.md](./SETUP.md).

## What Osprey does

Hyperliquid pays funding every hour (vs. every 8 hours on Binance/Bybit). When a pair's funding rate is elevated, shorting the perpetual and going long spot earns that rate with zero directional exposure. Osprey automates the workflow at portfolio scale:

| Module | Role |
|---|---|
| **Scanner** | Live heatmap of all HL funding rates — crypto and TradFi perps (NVDA, AAPL, GOLD, …) |
| **Harvest Engine** | Simultaneous delta-neutral positions across 20–100 qualifying pairs |
| **Portfolio Engine** | Dynamic sizing: OI caps, concentration limits, multi-tier allocation |
| **Regime Detection** | HOT / NEUTRAL / COLD signal from top-20 pairs by OI — gates entries in cold markets |
| **Entry Signals** | ENTER / WAIT / EXIT per pair from rate persistence and regime |
| **Live Mode** | Real orders via browser wallet or Agent Key — no MetaMask required |

## How it works

Funding harvesting is a spread trade against time, not a directional bet:

```text
Entry:    SELL BTC-PERP (captures funding)  +  BUY BTC-SPOT (delta hedge)
Exit:     BUY  BTC-PERP (close short)       +  SELL BTC-SPOT (close hedge)

P&L:      funding earned − round-trip fees
Exposure: ~zero (spot and perp move together)
```

Both legs are placed atomically — if the spot leg fails, the perp is emergency-closed so a naked short is never left open. Positions exit immediately on negative rates, on the exit-floor rate, on regime collapse, or at max hold time.

| Tier | Rate range | Action |
|---|---|---|
| Sub-threshold | < 0.005%/hr | Skip — below break-even after fees |
| Core | 0.005–0.020%/hr | Enter — steady yield |
| Elevated | 0.020–0.050%/hr | Enter (priority) |
| Hot | > 0.050%/hr | Enter (max size), monitor for reversal |
| Negative | < 0% | Exit immediately |

Yield projections, break-even math, fee tiers, and the regime model are derived in [INTERNALS.md](./INTERNALS.md).

## Repository layout

Osprey is an npm-workspaces monorepo. The engine is a standalone package (`@osprey/engine`, pure TypeScript, no React) consumed by the web app today and by a headless API server and SDK per [docs/architecture/api-sdk.md](./docs/architecture/api-sdk.md).

```text
osprey/
├── apps/
│   └── web/                     # React/Vite app (scanner, harvest UI, portfolio, analytics)
├── packages/
│   ├── engine/                  # @osprey/engine — harvest/regime/portfolio/hedge logic + HL API client
│   ├── server/                  # @osprey/server — REST/WebSocket API (in progress)
│   └── sdk/                     # @osprey/sdk — typed TypeScript client (in progress)
└── docs/architecture/api-sdk.md # design doc for server + sdk
```

## Wallet and auth

Osprey supports three signing modes — MetaMask is not required:

| Method | Best for | Autonomous |
|---|---|---|
| Browser wallet | Manual setup, first-time users | No (popup per order) |
| WalletConnect | Mobile wallets, Ledger/Trezor | No (popup per order) |
| **Agent Key** | Automated harvesting | Yes — no popups |

An Agent Key is a secondary EOA that Hyperliquid authorizes to trade on behalf of your main account. It cannot withdraw funds — even if compromised, your balance is safe. Setup instructions are in [SETUP.md](./SETUP.md#live-mode--wallet-setup).

## Testing

```bash
npm test
```

164 tests across the engine, stores, server, and SDK — including adversarial-input, failure-injection, and 5,000-cycle soak suites. See [TESTING.md](./TESTING.md) for structure and conventions.

## Security

Osprey places real orders with real capital and is beta software that has not been audited. Test on testnet and start small. Report vulnerabilities and review the full risk disclosures in [SECURITY.md](./SECURITY.md).

## License

Released under the [MIT License](./LICENSE).
