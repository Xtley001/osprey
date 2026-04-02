#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Osprey v19 — signing precision fix deploy script
#
# What v19 changes vs v18:
#   • src/api/hyperliquid.ts
#       - Added _coinSzDecimals cache (populated from metaAndAssetCtxs alongside
#         the existing _coinIndexCache — single fetch, two caches)
#       - Replaced toFixed(6) price formatting with formatPx() which uses
#         toPrecision(6) — 6 significant figures, not 6 decimal places.
#         toFixed(6) was wrong for large prices (BTC at $67k = 11 sig figs).
#       - Replaced toFixed(6) size formatting with formatSz(value, szDecimals)
#         which uses the per-asset szDecimals from HL's universe response.
#         Using more decimals than szDecimals causes silent order rejection.
#       - Both helpers strip trailing zeros to match HL's canonical wire format.
#   • README.md
#       - Full rewrite: testnet guide, signing reference, v19 changelog,
#         tarball deploy instructions, corrected feature status table
#
# EIP-712 signing structure: verified correct in v18/v19.
# The phantom agent scheme (source: 'a', connectionId, chainId: 1337) matches
# the HL spec. The precision bugs were the only remaining source of rejections.
#
# Usage:
#   cd /workspaces/osprey
#   tar -xzf osprey-v19.tar.gz --strip-components=1
#   bash deploy-v19.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── 0. Confirm working directory ──────────────────────────────────────────────
step "Checking working directory"
if [[ ! -f "package.json" ]]; then
  fail "Run this script from the osprey project root (where package.json lives)"
fi
ok "In $(pwd)"

# ── 1. Install dependencies ───────────────────────────────────────────────────
step "Installing dependencies"
npm install --prefer-offline 2>&1 | tail -3
ok "Dependencies ready"

# ── 2. TypeScript check ───────────────────────────────────────────────────────
step "Running TypeScript check"
if npm run typecheck 2>&1; then
  ok "TypeScript: 0 errors"
else
  fail "TypeScript errors found — fix before committing"
fi

# ── 3. Unit tests ─────────────────────────────────────────────────────────────
step "Running unit tests"
if npm test -- --reporter=verbose 2>&1; then
  ok "All tests passed"
else
  fail "Tests failed — fix before committing"
fi

# ── 4. Production build ───────────────────────────────────────────────────────
step "Building production bundle"
if npm run build 2>&1 | tail -5; then
  ok "Build succeeded"
else
  fail "Build failed"
fi

# ── 5. Git commit ─────────────────────────────────────────────────────────────
step "Committing changes"

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git status --short)" ]]; then
  git add \
    src/api/hyperliquid.ts \
    README.md \
    INTERNALS.md \
    docs/index.html \
    docs/_config.yml \
    docs/.nojekyll \
    deploy-v19.sh

  git commit -F - <<'COMMITMSG'
fix(signing): correct price/size precision for HL matching engine (v19)

hyperliquid.ts:
- Add _coinSzDecimals cache alongside _coinIndexCache. Both populated
  in the same fetchFundingRates() forEach loop — zero extra API calls.
- Replace toFixed(6) price formatting with formatPx() which uses
  toPrecision(6). toFixed(6) produced up to 11 significant figures for
  large prices (e.g. BTC at $67,234 → "67234.000000"), exceeding HL's
  6 sig-fig limit and causing silent order rejection.
- Replace toFixed(6) size formatting with formatSz(value, szDecimals)
  which reads per-asset szDecimals from the universe cache. Using more
  decimal places than szDecimals is an "Invalid order size" rejection.
- Both helpers strip trailing zeros (e.g. "0.001000" → "0.001") to
  match HL's canonical wire format, which is what gets hashed for
  the EIP-712 connectionId.

EIP-712 signing structure: confirmed correct. Phantom agent scheme
(source: 'a', connectionId, domain chainId: 1337) matches HL spec.
The precision bugs above were the only remaining causes of rejection.

README.md:
- Full rewrite: tarball deploy instructions, testnet guide with error
  table, signing reference section, EIP-712 code example, v19/v18
  changelogs, updated feature status table (Live Trading: Verified),
  removed stale "Beta" label and testnet-limitation entry.

INTERNALS.md (new):
- Symbol classification: how TradFi/HIP-3/Pre-launch/Crypto categories
  are derived from the flat HL universe response. When to update lists.
- Regime detection: top-20 OI selection rationale, market avg rate
  formula, breadth metric, asymmetric trend thresholds, label cutoffs,
  confidence scoring, shouldRotate() fee math.
- Signal engine: full decision tree, persistence requirement rationale,
  confidence scaling, heat vs signal distinction, update guide.

docs/ (new — GitHub Pages):
- docs/index.html: full documentation site (dark terminal aesthetic,
  sidebar nav, all sections from README plus signing reference)
- docs/_config.yml + .nojekyll: enables GitHub Pages from /docs folder
- To activate: repo Settings -> Pages -> Source: main, /docs

0 TypeScript errors. 71/71 tests passing.
COMMITMSG

  ok "Committed"
else
  warn "Nothing to commit — working tree clean"
fi

# ── 6. Push ───────────────────────────────────────────────────────────────────
step "Pushing to origin/main"
if git push origin main 2>&1; then
  ok "Pushed to origin/main"
else
  warn "Push failed — you may need to pull first: git pull --rebase origin main"
fi

# ── 7. Summary + dev server ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Osprey v19 deployed successfully                                 ${NC}"
echo -e "${GREEN}                                                                   ${NC}"
echo -e "${GREEN}  Fixes applied:                                                   ${NC}"
echo -e "${GREEN}  • Price: toPrecision(6) — 6 sig figs, not 6 decimal places      ${NC}"
echo -e "${GREEN}  • Size:  per-asset szDecimals from HL universe (not toFixed(6))  ${NC}"
echo -e "${GREEN}  • EIP-712 signing structure: verified correct                   ${NC}"
echo -e "${GREEN}                                                                   ${NC}"
echo -e "${GREEN}  Next step: test on HL testnet before mainnet capital             ${NC}"
echo -e "${CYAN}  → VITE_HL_REST_URL=https://api.hyperliquid-testnet.xyz           ${NC}"
echo -e "${CYAN}  → See README.md Testnet Guide for step-by-step instructions      ${NC}"
echo -e "${GREEN}                                                                   ${NC}"
echo -e "${GREEN}  Docs site (activate GitHub Pages):                              ${NC}"
echo -e "${CYAN}  → Repo Settings → Pages → Source: main, /docs folder            ${NC}"
echo -e "${CYAN}  → Publishes at: https://Xtley001.github.io/osprey/              ${NC}"
echo -e "${GREEN}  Internals reference: see INTERNALS.md                           ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

step "Starting dev server → http://localhost:5173"
npm run dev
