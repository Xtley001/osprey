/**
 * Backtester — corrected fee model, CAGR, and Sharpe ratio.
 *
 * Fixes from 01_CALCULATIONS_AUDIT.md:
 *   - Fee base corrected: fees on capitalUSDC/2 per leg (not full capital)
 *   - Total round-trip = capitalUSDC × (makerFee + takerFee) = correct
 *   - CAGR added alongside simple annualized return
 *   - Sharpe switched to hourly equity curve returns with Rf subtracted
 *   - Multi-pair portfolio backtest mode added
 *   - Named strategy presets (Conservative, Balanced, Opportunistic)
 */

import type { BacktestParams, BacktestResult, TradeRecord, BacktestMetrics } from '../types/backtest';
import type { FundingEvent, Candle } from '../types/funding';
import { PRESET_CONSERVATIVE, PRESET_BALANCED, PRESET_OPPORTUNISTIC } from '../utils/constants';

export { PRESET_CONSERVATIVE, PRESET_BALANCED, PRESET_OPPORTUNISTIC };

let tradeIdCounter = 1;

function getRateAtHour(history: FundingEvent[], ts: number): number {
  let best: FundingEvent | null = null;
  for (const ev of history) {
    if (ev.timestamp <= ts) {
      if (!best || ev.timestamp > best.timestamp) best = ev;
    }
  }
  return best?.rate ?? 0;
}

function getPriceAtHour(candles: Candle[], ts: number): number {
  let best: Candle | null = null;
  for (const c of candles) {
    if (c.timestamp <= ts) {
      if (!best || c.timestamp > best.timestamp) best = c;
    }
  }
  return best?.close ?? 0;
}

function getConsecutiveHoursAbove(
  history:   FundingEvent[],
  ts:        number,
  threshold: number,
  required:  number
): boolean {
  let count = 0;
  for (let i = 0; i < required; i++) {
    const rate = getRateAtHour(history, ts - i * 3_600_000);
    if (rate >= threshold) count++;
    else break;
  }
  return count >= required;
}

// ── CORRECTED computeMetrics ──────────────────────────────────────────────────
function computeMetrics(
  trades:         TradeRecord[],
  curve:          { timestamp: number; equity: number }[],
  initialCapital: number
): BacktestMetrics & { cagr: number; daysInBacktest: number } {
  if (trades.length === 0) {
    return {
      totalReturn: 0, totalFundingEarned: 0, totalFeesPaid: 0, netProfit: 0,
      winRate: 0, avgHoldHours: 0, sharpeRatio: 0, maxDrawdown: 0,
      numTrades: 0, bestTrade: 0, worstTrade: 0, annualizedYield: 0,
      cagr: 0, daysInBacktest: 0,
    };
  }

  const totalFundingEarned = trades.reduce((s, t) => s + t.grossFunding, 0);
  const totalFeesPaid      = trades.reduce((s, t) => s + t.fees, 0);
  const netProfit          = trades.reduce((s, t) => s + t.net, 0);
  const finalEquity        = curve[curve.length - 1]?.equity ?? initialCapital;
  const totalReturn        = ((finalEquity - initialCapital) / initialCapital) * 100;
  const daysInBacktest     = (curve[curve.length - 1]?.timestamp - curve[0]?.timestamp) / 86_400_000 || 1;

  const winning   = trades.filter(t => t.net > 0);
  const winRate   = (winning.length / trades.length) * 100;
  const avgHoldHours = trades.reduce((s, t) => s + t.hoursHeld, 0) / trades.length;

  const nets       = trades.map(t => t.net);
  const bestTrade  = Math.max(...nets);
  const worstTrade = Math.min(...nets);

  // ── CORRECTED Sharpe: use hourly equity curve returns, subtract Rf ──────────
  // Industry standard: hourly returns on the equity curve, annualized with sqrt(8760)
  const RF_HOURLY = 0.05 / 8_760; // 5% annual risk-free rate (USDC yield)

  const hourlyReturns = curve
    .slice(1)
    .map((pt, i) => {
      const prev = curve[i].equity;
      return prev > 0 ? (pt.equity - prev) / prev : 0;
    });

  let sharpeRatio = 0;
  if (hourlyReturns.length > 1) {
    const excess     = hourlyReturns.map(r => r - RF_HOURLY);
    const meanExcess = excess.reduce((s, r) => s + r, 0) / excess.length;
    const variance   = excess.reduce((s, r) => s + (r - meanExcess) ** 2, 0) / excess.length;
    const stdDev     = Math.sqrt(variance);
    sharpeRatio      = stdDev > 0 ? (meanExcess / stdDev) * Math.sqrt(8_760) : 0;
  }

  // ── Max drawdown ─────────────────────────────────────────────────────────────
  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const pt of curve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = ((peak - pt.equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // ── Simple annualized + CAGR ─────────────────────────────────────────────────
  const annualizedYield = (totalReturn / daysInBacktest) * 365;
  const years           = daysInBacktest / 365;
  const cagr            = years > 0 && initialCapital > 0
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : 0;

  return {
    totalReturn, totalFundingEarned, totalFeesPaid, netProfit, winRate,
    avgHoldHours, sharpeRatio, maxDrawdown, numTrades: trades.length,
    bestTrade, worstTrade, annualizedYield, cagr, daysInBacktest,
  };
}

// ── Single-pair backtest ──────────────────────────────────────────────────────
export function runBacktest(
  params:         BacktestParams,
  fundingHistory: FundingEvent[],
  priceHistory:   Candle[]
): BacktestResult & { metrics: BacktestMetrics & { cagr: number; daysInBacktest: number } } {
  const { strategy, initialCapital } = params;
  const start  = params.startDate.getTime();
  const end    = params.endDate.getTime();
  const hourMs = 3_600_000;

  let equity    = initialCapital;
  let inTrade   = false;
  let entryTime = 0, entryPrice = 0, entryRate = 0;
  let tradeGross = 0, tradeFees = 0, hoursHeld = 0;

  // ── CORRECTED fee model ───────────────────────────────────────────────────
  // Fees apply to EACH LEG separately (perp + spot), each at capitalUSDC/2 notional.
  // Round-trip = (perpNotional × makerFee) + (spotNotional × makerFee)     [entry]
  //            + (perpNotional × takerFee) + (spotNotional × takerFee)     [exit]
  // = capitalUSDC/2 × (makerFee + takerFee) × 2
  // = capitalUSDC × (makerFee + takerFee)                                  [correct]
  //
  // Old code used capitalUSDC (not /2) as fee base — overstated fees by 2×.
  const perpNotional   = strategy.capitalUSDC / 2;
  const entryFee       = perpNotional * strategy.makerFee * 2;   // both legs, maker entry
  const exitFee        = perpNotional * strategy.takerFee * 2;   // both legs, taker exit
  const roundTrip      = entryFee + exitFee;
  const amortizedFeePerHour = roundTrip / Math.max(strategy.maxHoldHours, 1);

  const trades:      TradeRecord[]                          = [];
  const equityCurve: { timestamp: number; equity: number }[] = [];

  for (let ts = start; ts <= end; ts += hourMs) {
    const rate  = getRateAtHour(fundingHistory, ts);
    const price = getPriceAtHour(priceHistory, ts);

    if (!inTrade) {
      const elevated = getConsecutiveHoursAbove(
        fundingHistory, ts, strategy.entryRateThreshold, strategy.minHoursElevated
      );
      if (elevated && rate > 0) {
        inTrade = true; entryTime = ts; entryPrice = price; entryRate = rate;
        tradeGross = 0; tradeFees = entryFee; hoursHeld = 0;
      }
    } else {
      hoursHeld++;

      // Funding earned only on the perp notional (spot earns no funding)
      const grossHour = perpNotional * rate;
      tradeGross += grossHour;
      equity      = equity + grossHour - amortizedFeePerHour;

      // Rebalance fee on drift notional
      if (price > 0 && entryPrice > 0) {
        const drift = Math.abs((price - entryPrice) / entryPrice) * 100;
        if (drift > strategy.rebalanceThreshold) {
          const driftNotional = strategy.capitalUSDC * (drift / 100);
          const rebalFee = driftNotional * strategy.takerFee;
          tradeFees += rebalFee;
          equity    -= rebalFee;
          entryPrice = price;
        }
      }

      const shouldExit =
        rate < strategy.exitRateThreshold ||
        rate < 0 ||
        hoursHeld >= strategy.maxHoldHours;

      if (shouldExit) {
        tradeFees += exitFee;
        const net = tradeGross - tradeFees;
        trades.push({
          id:           `bt-${tradeIdCounter++}`,
          symbol:       params.symbol,
          entryTime,
          exitTime:     ts,
          hoursHeld,
          entryRate,
          avgRate:      tradeGross / hoursHeld / perpNotional,
          grossFunding: tradeGross,
          fees:         tradeFees,
          net,
        });
        inTrade = false;
      }
    }

    equityCurve.push({ timestamp: ts, equity });
  }

  return {
    trades,
    equityCurve,
    metrics: computeMetrics(trades, equityCurve, initialCapital),
    params,
    runAt: Date.now(),
  };
}

// ── Multi-pair portfolio backtest ─────────────────────────────────────────────
export interface PortfolioBacktestParams {
  startDate:       Date;
  endDate:         Date;
  initialCapital:  number;
  capitalPerPair:  number;
  maxSimultaneous: number;
  entryThreshold:  number;
  exitThreshold:   number;
  makerFee:        number;
  takerFee:        number;
}

export interface PortfolioBacktestResult {
  trades:      TradeRecord[];
  equityCurve: { timestamp: number; equity: number }[];
  metrics:     BacktestMetrics & { cagr: number; daysInBacktest: number; avgActivePairs: number };
  params:      PortfolioBacktestParams;
  runAt:       number;
}

export function runPortfolioBacktest(
  params:                 PortfolioBacktestParams,
  fundingDataBySymbol:    Map<string, FundingEvent[]>,
  _priceDataBySymbol?:    Map<string, Candle[]>,
): PortfolioBacktestResult {
  const { startDate, endDate, initialCapital, capitalPerPair } = params;
  const hourMs = 3_600_000;

  let equity = initialCapital;
  const perpPerPair = capitalPerPair / 2;
  const entryFeePerPair = perpPerPair * params.makerFee * 2;
  const exitFeePerPair  = perpPerPair * params.takerFee * 2;

  const positions: Map<string, {
    entryTime:     number;
    perpNotional:  number;
    entryRate:     number;
    fundingEarned: number;
    fees:          number;
  }> = new Map();

  const trades:      TradeRecord[]                          = [];
  const equityCurve: { timestamp: number; equity: number }[] = [];
  const hourlyActivePairs: number[] = [];

  for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += hourMs) {

    // Accrue funding on all active positions; exit if rate dropped
    for (const [symbol, pos] of positions) {
      const rate   = getRateAtHour(fundingDataBySymbol.get(symbol) ?? [], ts);
      const earned = pos.perpNotional * rate;
      pos.fundingEarned += earned;
      equity            += earned;

      if (rate < params.exitThreshold || rate < 0) {
        const net = pos.fundingEarned - pos.fees - exitFeePerPair;
        trades.push({
          id:           `pt-${tradeIdCounter++}`,
          symbol,
          entryTime:    pos.entryTime,
          exitTime:     ts,
          hoursHeld:    (ts - pos.entryTime) / hourMs,
          entryRate:    pos.entryRate,
          avgRate:      pos.fundingEarned / Math.max((ts - pos.entryTime) / hourMs, 1) / pos.perpNotional,
          grossFunding: pos.fundingEarned,
          fees:         pos.fees + exitFeePerPair,
          net,
        });
        equity -= exitFeePerPair;
        positions.delete(symbol);
      }
    }

    // Enter new positions
    const slotsAvailable = params.maxSimultaneous - positions.size;
    if (slotsAvailable > 0 && equity >= capitalPerPair) {
      const candidates = [...fundingDataBySymbol.entries()]
        .map(([symbol, data]) => ({ symbol, rate: getRateAtHour(data, ts) }))
        .filter(({ symbol, rate }) => !positions.has(symbol) && rate >= params.entryThreshold && rate > 0)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, slotsAvailable);

      for (const { symbol, rate } of candidates) {
        if (equity < capitalPerPair) break;
        equity -= entryFeePerPair;
        positions.set(symbol, {
          entryTime:     ts,
          perpNotional:  perpPerPair,
          entryRate:     rate,
          fundingEarned: 0,
          fees:          entryFeePerPair,
        });
      }
    }

    hourlyActivePairs.push(positions.size);
    equityCurve.push({ timestamp: ts, equity });
  }

  const avgActivePairs = hourlyActivePairs.reduce((s, n) => s + n, 0) / Math.max(hourlyActivePairs.length, 1);
  const base           = computeMetrics(trades, equityCurve, initialCapital);

  return {
    trades,
    equityCurve,
    metrics: { ...base, avgActivePairs },
    params,
    runAt: Date.now(),
  };
}

// ── Dynamic fee integration helpers ──────────────────────────────────────────

/**
 * Convert OspreyFees to BacktestStrategy fee fields.
 * Use this when running a backtest with the user's live fees.
 *
 * Usage:
 *   const fees = useFeeStore.getState().fees;
 *   const strategy = { ...myStrategy, ...feesToStrategyFees(fees) };
 */
export function feesToStrategyFees(fees: { perpTaker: number; perpMaker: number }): {
  takerFee: number;
  makerFee: number;
} {
  return {
    takerFee: fees.perpTaker,
    makerFee: fees.perpMaker,
  };
}

/**
 * Round-trip cost as a percentage of notional.
 * Used to annotate backtest results with fee context.
 *
 * Example: at Tier 0, round-trip = 0.045% + 0.015% = 0.060% of perp notional
 *          (× 2 for both perp + spot legs = 0.120% of total capital)
 */
export function roundTripCostPct(fees: { perpTaker: number; perpMaker: number; spotTaker: number; spotMaker: number }): number {
  return (fees.perpMaker + fees.perpTaker) + (fees.spotMaker + fees.spotTaker);
}
