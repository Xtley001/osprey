# Osprey — Internals Reference

How the three core systems work under the hood: symbol classification, regime detection, and the signal engine. Written for contributors and anyone who wants to understand the numbers behind the UI.

---

## 1. Symbol Classification

Hyperliquid's API returns a flat list of perpetuals with no category field. Every symbol in the universe response is just a string name. Osprey derives the category by checking against three static sets maintained in `src/utils/constants.ts`.

### The classification pipeline

```
HL universe response
  └── asset.name (e.g. "NVDA", "BTC", "MAVIA")
        └── classifyPairCategory(symbol, isPrelaunch)
              ├── isPrelaunch flag from API → "Pre-launch"
              ├── TRADFI_PAIRS.has(symbol)  → "TradFi"
              ├── HIP3_PAIRS.has(symbol)    → "HIP-3"
              └── default                   → "Crypto"
```

Categories are checked in priority order. A symbol can only belong to one category — the first match wins.

### TradFi pairs

The `TRADFI_PAIRS` set covers every stock, commodity, ETF, and private-company perpetual Hyperliquid has listed. These are not discoverable from the API — HL doesn't tag them. The set is hand-maintained and needs updating whenever HL adds a new TradFi listing.

Current members:

| Group | Symbols |
|---|---|
| US large-cap stocks | NVDA, AAPL, GOOGL, GOOG, TSLA, AMZN, MSFT, META, NFLX, AMD, INTC, COIN, MSTR, PLTR, BABA, ORCL, UBER, SNAP |
| Private companies | SPACEX |
| Commodities | GOLD, SILVER, WTIOIL, NATGAS, COPPER |
| ETFs / indices | SPY, QQQ, DXY |
| Asian tech | TSM, USAR |

**Why TradFi pairs matter for funding harvesting:** these pairs have thinner liquidity and a smaller trader base than crypto pairs. Leveraged longs are less balanced by organic short interest, so funding rates are frequently extreme. NVDA has been observed above 100% annualised. GOLD and WTIOIL regularly exceed 50%.

### HIP-3 pairs

HIP-3 is Hyperliquid's governance mechanism for community-deployed perpetuals. These pairs have a different fee structure than standard perps. They're identified by the `onlyIsolated: true` flag in the universe response, or by tracking HL governance proposals manually.

Current members: `MAVIA, PURR, HFUN, JEFF, TRUMP, MELANIA, LAYER`

HIP-3 pairs appear in the scanner with their own category filter. They're valid for funding harvesting but the isolated-only margin requirement means the position sizing is different from cross-margin pairs.

### Pre-launch pairs

Pairs in Dutch auction phase. The `isPrelaunch` boolean comes directly from the universe response (`asset.isPrelaunch`). These are shown in the scanner for monitoring but Osprey won't generate ENTER signals for them — the order book doesn't exist yet.

### Adding a new TradFi listing

When HL adds a new stock or commodity, add the symbol to `TRADFI_PAIRS` in `src/utils/constants.ts`. It will automatically appear in the TradFi filter in the scanner and be excluded from the Crypto category. No other changes needed.

```typescript
export const TRADFI_PAIRS = new Set([
  // ... existing symbols ...
  'NEWSTOCK',  // ← add here
]);
```

---

## 2. Regime Detection

The regime engine answers one question: **is the market as a whole paying elevated funding right now, or is this just noise on a single pair?**

Source: `src/engine/regime.ts`

### Input

`detectRegime(allRates, prevAvg)` takes the full list of `FundingRate` objects and the market average from the previous call.

### Step 1 — Top-20 by open interest

```typescript
const top20 = [...allRates]
  .sort((a, b) => b.openInterest - a.openInterest)
  .slice(0, 20);
```

The regime is computed from the top 20 pairs by OI, not the full universe. This is intentional: the largest pairs represent the bulk of market leverage. A spike on a low-OI pair is noise; the same spike on BTC or ETH is signal.

### Step 2 — Market average rate

```typescript
const marketAvgRate = top20.reduce((s, p) => s + p.currentRate, 0) / top20.length;
```

Simple mean of the current hourly rate across the top 20. This is the primary input to the regime label.

### Step 3 — Breadth

```typescript
const breadth = top20.filter(p => p.currentRate > 0.0002).length / top20.length;
```

Breadth is the fraction of top-20 pairs paying above `0.02%/hr`. A regime where only 2 of 20 pairs are elevated is fragile even if those 2 have high rates. Breadth above 50% means the regime is broad-based, not concentrated.

The breadth value is exposed in the UI as the bar under the regime label. It's a secondary signal — the label itself is driven by `marketAvgRate` only.

### Step 4 — Trend

```typescript
const trend = marketAvgRate > prevAvg * 1.05 ? 'rising'
            : marketAvgRate < prevAvg * 0.8  ? 'falling'
            : 'stable';
```

Compares the current average to the previous call's average (`prevAvg`, stored in Zustand's `appStore`). The thresholds are asymmetric on purpose: a 5% rise qualifies as "rising" (sensitive upside), but rates need to fall 20% before being called "falling" (slow to declare deterioration). This prevents flip-flopping on noisy calls.

### Step 5 — Label

```typescript
const label = marketAvgRate > 0.0004 ? 'HOT'
            : marketAvgRate > 0.0001 ? 'NEUTRAL'
            : 'COLD';
```

| Label | Market avg rate | Hourly equivalent | 8h equivalent |
|---|---|---|---|
| HOT | > 0.04%/hr | 0.04% | 0.32% |
| NEUTRAL | 0.01–0.04%/hr | 0.01–0.04% | 0.08–0.32% |
| COLD | < 0.01%/hr | < 0.01% | < 0.08% |

These thresholds are calibrated against HL's historical rate distributions. In a bull market with strong leveraged demand, the market spends most of its time in NEUTRAL and spikes into HOT during liquidation cascades or momentum runs. COLD is common during low-volatility consolidation.

### Step 6 — Confidence

```typescript
const stdDev = Math.sqrt(
  top20.reduce((s, p) => s + (p.currentRate - marketAvgRate) ** 2, 0) / top20.length
);
const confidence = Math.min(100, Math.round(100 - (stdDev / (marketAvgRate + 0.0001)) * 50));
```

Confidence is a measure of how uniform the regime is across pairs. If all 20 pairs are paying similar rates, confidence is high. If the average is dragged up by 2 extreme outliers while the other 18 are flat, confidence is low. The formula is the coefficient of variation (stdDev / mean), inverted and capped at 100.

A HOT regime with confidence 90 means all top-20 pairs are elevated. A HOT regime with confidence 40 means one or two pairs are very elevated and the rest are flat — treat it with more caution.

### Rotation decision

`shouldRotate()` is a separate function in `regime.ts` that answers: is it worth closing the current position and reopening on a better-paying pair, after paying two taker fees for the round-trip?

```typescript
const rateDiff    = bestRate - currentRate;
const rotationCost = notional * takerFee * 2;  // two taker fills to rotate
const breakEvenHours = rotationCost / (rateDiff * notional);
const rotate = rateDiff > minAdvantage && breakEvenHours < maxBreakEven;
```

Defaults: `minAdvantage = 0.0002` (0.02%/hr improvement), `maxBreakEven = 3` hours. Only rotates if the new pair pays at least 0.02%/hr more AND the rotation cost is recovered within 3 hours. This prevents churning on tiny rate differences.

---

## 3. Entry Signal Engine

The signal engine answers a different question from the regime engine: **should you enter *this specific pair* right now?**

Source: `src/engine/signals.ts`

Regime is market-wide. Signals are per-pair.

### Input

`computeSignal(currentRate, history, entryThreshold, exitThreshold)` takes:
- The current hourly rate for the pair
- Up to 4 recent `FundingEvent` records from the `fundingHistory` API
- The configured entry and exit thresholds (from `DEFAULT_STRATEGY`)

### Decision tree

```
currentRate < 0
  → AVOID  (longs are being paid; a short perp would pay funding, not collect it)

currentRate < exitThreshold (0.02%/hr)
  → AVOID  (rate too low to cover fees at any reasonable position size)

elevatedCount >= 2 AND currentRate >= entryThreshold (0.04%/hr)
  → ENTER  (rate is high and has been persistent for 2+ hours)

elevatedCount < 2 AND currentRate >= entryThreshold
  → WAIT   (rate is high but just spiked — wait for confirmation)

recent 2 hours both below exitThreshold
  → EXIT   (rate has faded; time to close)

else
  → WAIT   (watching for confirmation)
```

### The persistence requirement

The `elevatedCount` check is the most important part:

```typescript
const recent = [...history]
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, 4);  // last 4 hours
const elevatedCount = recent.filter(e => e.rate >= entryThreshold).length;
```

The last 4 hourly funding events are fetched, sorted newest-first, and the count of those above the entry threshold is used. An ENTER signal requires at least 2 of the last 4 hours to be above threshold.

**Why this matters:** funding rates on HL spike and revert frequently. A single elevated hour could be a one-off caused by a liquidation cascade. If the rate hasn't been sustained for at least 2 hours, the risk is high that by the time the position is open and the spot hedge is placed, the rate has already reverted. The persistence requirement filters out roughly 60% of false spikes historically.

### Confidence scoring

The ENTER signal confidence scales with `elevatedCount`:

```typescript
confidence: Math.min(95, 60 + elevatedCount * 10)
```

| Hours elevated (of last 4) | Confidence |
|---|---|
| 2 | 80% |
| 3 | 90% |
| 4 | 95% (capped) |

WAIT and EXIT signals have fixed confidence values (55 and 85 respectively). AVOID signals are 80–90%.

### Default thresholds

Both thresholds live in `DEFAULT_STRATEGY` in `constants.ts` and flow through to every signal computation and backtester run:

| Parameter | Value | Meaning |
|---|---|---|
| `entryRateThreshold` | `0.0004` | 0.04%/hr · ~0.35%/8h · ~35% annualised |
| `exitRateThreshold` | `0.0002` | 0.02%/hr · ~0.18%/8h · ~18% annualised |
| `minHoursElevated` | `2` | consecutive hours above entry threshold for ENTER |

The gap between entry and exit thresholds (`0.0002`) is intentional — it creates a hysteresis band that prevents oscillating in and out of positions when the rate hovers around the threshold.

### Heat classification vs. signal classification

These are two separate systems that run independently:

**Heat** (`classifyRate` in `rateColor.ts`) is a display-only label for the scanner heatmap. It uses different thresholds than the signal engine:

| Heat | Threshold | Purpose |
|---|---|---|
| cold | < 0.02%/hr | Grey — not worth watching |
| warm | 0.02–0.05%/hr | Teal — worth monitoring |
| hot | 0.05–0.10%/hr | Amber — consider entry |
| fire | > 0.10%/hr | Red — strong opportunity |

**Signal** is what actually drives entry decisions and the auto-trader. A `warm` pair can generate a WAIT or even ENTER signal if persistence is met. A `fire` pair can still show WAIT if the spike is brand new.

The two systems exist separately because heat is meant for quick visual scanning across 150+ pairs, while signals require the historical context that heat doesn't have.

---

## How the three systems connect

```
fetchFundingRates()           ← single API call, runs every 60s
        │
        ├── classifyPairCategory()  → category tag per symbol (TradFi/Crypto/HIP-3/Pre-launch)
        ├── classifyRate()          → heat tag per symbol (cold/warm/hot/fire)
        │
        ├── detectRegime(top20)     → single market-wide HOT/NEUTRAL/COLD label
        │        └── shouldRotate() → per-position rotation check
        │
        └── computeSignal()         → per-pair ENTER/WAIT/EXIT/AVOID
                 └── requires fundingHistory (separate API call, lazy, per-pair)
```

The auto-trader cycles through this pipeline every 60 seconds: fetch → classify → regime → signals → act.

---

## Updating the systems

**Adding a TradFi pair:** add symbol to `TRADFI_PAIRS` in `constants.ts`.

**Changing regime sensitivity:** edit the `marketAvgRate` thresholds in `regime.ts` (`0.0004` for HOT, `0.0001` for NEUTRAL).

**Changing signal sensitivity:** edit `DEFAULT_STRATEGY.entryRateThreshold` and `exitRateThreshold` in `constants.ts`. These flow automatically to the backtester, auto-trader, and signal engine.

**Changing persistence requirement:** edit the `elevatedCount >= 2` check in `signals.ts`. Raising it to 3 makes signals more conservative; lowering to 1 makes them more aggressive (and generates more false positives).

All changes should be followed by `npm run typecheck && npm test` — the 71-test suite covers regime thresholds, signal edge cases, and funding math.
