# Osprey — Setup Guide

## Prerequisites

- Node.js 18+
- npm 9+
- A Hyperliquid account (for live mode)

## Quick start

```bash
git clone https://github.com/yourusername/osprey.git
cd osprey
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173` — demo mode works immediately, no configuration needed.

---

## Environment variables

Copy `.env.example` to `.env` and configure:

```bash
# Required — Hyperliquid endpoints (defaults point to mainnet)
VITE_HL_REST_URL=https://api.hyperliquid.xyz
VITE_HL_WS_URL=wss://api.hyperliquid.xyz/ws

# Optional — testnet (recommended before using real capital)
VITE_HL_TESTNET_REST=https://api.hyperliquid-testnet.xyz
VITE_HL_TESTNET_WS=wss://api.hyperliquid-testnet.xyz/ws

# Feature flags
VITE_ENABLE_REAL_TRADING=true     # set false to disable live trading UI
VITE_ENABLE_TESTNET=true          # set false to hide testnet option
VITE_ENABLE_AGENT_KEYS=true       # set false to hide agent key auth

# WalletConnect — get free project ID at cloud.walletconnect.com
VITE_WALLETCONNECT_PROJECT_ID=    # leave empty to disable WalletConnect
```

---

## Demo mode

No configuration required. Demo mode:
- Uses real live funding rates from Hyperliquid
- Simulates position P&L with hourly funding accrual
- Clearly labels all metrics `[DEMO]`
- Starting balance configurable (default $10,000)

---

## Live mode — wallet setup

Osprey supports three wallet types. Choose based on your use case:

### Option A: Browser wallet (simplest)

Any EIP-1193 compatible wallet works: MetaMask, Coinbase Wallet, Brave Wallet, Rainbow.

1. Install your wallet extension
2. Go to Settings → Trading Authorization
3. Click "Connect Browser Wallet"
4. Approve the connection request

**Limitation:** Every trade order triggers an approval popup. Not suitable for the automated harvest engine.

### Option B: WalletConnect (mobile / hardware)

For Ledger, Trezor, Trust Wallet, or any WalletConnect-compatible wallet:

1. Add `VITE_WALLETCONNECT_PROJECT_ID` to `.env` (free at [cloud.walletconnect.com](https://cloud.walletconnect.com))
2. Go to Settings → Trading Authorization
3. Click "Connect via WalletConnect"
4. Scan the QR code with your mobile wallet

**Limitation:** Same popup requirement as browser wallets.

### Option C: Agent Key (recommended for automation)

An Agent Key is a secondary keypair that Hyperliquid authorizes to trade on behalf of your main account. It **cannot withdraw funds** — the worst case scenario if compromised is position manipulation, not capital theft.

**Setup:**

1. Go to Settings → Trading Authorization → Agent Key
2. Click "Generate New Agent Key" — Osprey creates a fresh random EOA
3. Connect your main wallet (MetaMask or WalletConnect) — needed once for authorization
4. Click "Authorize on Hyperliquid" — sign the `approveAgent` transaction
5. Enter a password to encrypt the key locally
6. **Export your key** and store it safely before clearing browser data

After setup, the harvest engine runs fully autonomously — no popups, no browser extension needed.

---

## Live trading — first run checklist

- [ ] Test on Hyperliquid testnet first
- [ ] Start with small positions ($50–$100 per pair)
- [ ] Verify one manual entry/exit on testnet before enabling the engine
- [ ] Check regime detection is showing NEUTRAL or HOT before enabling
- [ ] Set `hedgeMode` appropriately:
  - `hl_spot` — Osprey manages HL spot leg (default)
  - `external_spot` — You hold spot on another exchange; Osprey manages only the perp
  - `perp_only` — **DANGEROUS**: naked short, no hedge, directional exposure

---

## Testnet setup

Hyperliquid testnet faucet: [app.hyperliquid-testnet.xyz/drip](https://app.hyperliquid-testnet.xyz/drip)

Set `VITE_ENABLE_TESTNET=true`, then select "Testnet" in Settings → Account Mode.

---

## Running tests

```bash
npm run test
```

Tests cover the core engine logic (funding math, backtester, regime detection) without any network calls.

---

## Building for production

```bash
npm run build
npm run preview   # preview the build locally
```

Deploy the `dist/` folder to Vercel, Cloudflare Pages, or any static host.

```bash
# Vercel
vercel deploy

# Or: set up CI via .github/workflows/ci.yml (already configured)
```
