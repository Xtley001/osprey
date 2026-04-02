import type { BacktestParams, BacktestResult, TradeRecord, BacktestMetrics } from '../types/backtest';
import type { FundingEvent, Candle } from '../types/funding';

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
  history: FundingEvent[],
  ts: number,
  threshold: number,
  required: number
): boolean {
  let count = 0;
  for (let i = 0; i < required; i++) {
    const t = ts - i * 3_600_000;
    const rate = getRateAtHour(history, t);
    if (rate >= threshold) count++;
    else break;
  }
  return count >= required;
}

function computeMetrics(
  trades: TradeRecord[],
  curve: { timestamp: number; equity: number }[],
  initialCapital: number
): BacktestMetrics {
  if (trades.length === 0) {
    return {
      totalReturn: 0, totalFundingEarned: 0, totalFeesPaid: 0, netProfit: 0,
      winRate: 0, avgHoldHours: 0, sharpeRatio: 0, maxDrawdown: 0,
      numTrades: 0, bestTrade: 0, worstTrade: 0, annualizedYield: 0,
    };
  }

  const totalFundingEarned = trades.reduce((s, t) => s + t.grossFunding, 0);
  const totalFeesPaid = trades.reduce((s, t) => s + t.fees, 0);
  const netProfit = trades.reduce((s, t) => s + t.net, 0);
  const finalEquity = curve[curve.length - 1]?.equity ?? initialCapital;
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;

  const winning = trades.filter(t => t.net > 0);
  const winRate = (winning.length / trades.length) * 100;
  const avgHoldHours = trades.reduce((s, t) => s + t.hoursHeld, 0) / trades.length;

  const nets = trades.map(t => t.net);
  const bestTrade = Math.max(...nets);
  const worstTrade = Math.min(...nets);

  const returns = trades.map(t => t.net / initialCapital);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const sharpeRatio = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(8760 / avgHoldHours) : 0;

  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const pt of curve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = ((peak - pt.equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const daysInBacktest = (curve[curve.length - 1]?.timestamp - curve[0]?.timestamp) / 86_400_000 || 1;
  const annualizedYield = (totalReturn / daysInBacktest) * 365;

  return {
    totalReturn, totalFundingEarned, totalFeesPaid, netProfit, winRate,
    avgHoldHours, sharpeRatio, maxDrawdown, numTrades: trades.length,
    bestTrade, worstTrade, annualizedYield,
  };
}

export function runBacktest(
  params: BacktestParams,
  fundingHistory: FundingEvent[],
  priceHistory: Candle[]
): BacktestResult {
  const { strategy, initialCapital } = params;
  const start = params.startDate.getTime();
  const end = params.endDate.getTime();
  const hourMs = 3_600_000;

  let equity = initialCapital;
  let inTrade = false;
  let entryTime = 0;
  let entryPrice = 0;
  let entryRate = 0;
  let tradeGross = 0;
  let tradeFees = 0;
  let hoursHeld = 0;
  let tradeSymbol = params.symbol;

  const trades: TradeRecord[] = [];
  const equityCurve: { timestamp: number; equity: number }[] = [];

  // ── Fee model (v18 — maker entry, taker exit) ──────────────────────────────
  //
  // Entry orders use 'Alo' (post-only maker) by default → makerFee (0.010%).
  // Exit orders use 'Ioc' (immediate-or-cancel taker)  → takerFee (0.035%).
  //
  // This reflects the real order routing in hyperliquid.ts where placeMarketOrder
  // defaults tif to 'Alo' for entries and callers can pass 'Ioc' for exits.
  //
  // Round-trip cost per $5,000 notional:
  //   Old (both taker): $1.75 + $1.75 = $3.50
  //   New (maker+taker): $0.50 + $1.75 = $2.25  → −36%
  //
  // Rebalance fee uses actual drift notional rather than a fixed 10% heuristic.

  const entryFee  = strategy.capitalUSDC * strategy.makerFee;   // Alo = maker
  const exitFee   = strategy.capitalUSDC * strategy.takerFee;   // Ioc = taker
  const roundTrip = entryFee + exitFee;

  // Amortize round-trip across maxHoldHours for the equity curve display
  // (conservative drag; exact fees are captured per trade record)
  const amortizedFeePerHour = roundTrip / Math.max(strategy.maxHoldHours, 1);

  for (let ts = start; ts <= end; ts += hourMs) {
    const rate = getRateAtHour(fundingHistory, ts);
    const price = getPriceAtHour(priceHistory, ts);

    if (!inTrade) {
      const elevated = getConsecutiveHoursAbove(
        fundingHistory, ts, strategy.entryRateThreshold, strategy.minHoursElevated
      );
      if (elevated && rate > 0) {
        inTrade = true;
        entryTime = ts;
        entryPrice = price;
        entryRate = rate;
        tradeGross = 0;
        tradeFees = entryFee;   // maker entry fee charged on open
        hoursHeld = 0;
        tradeSymbol = params.symbol;
      }
    } else {
      hoursHeld++;

      const grossHour = (strategy.capitalUSDC / 2) * rate;
      tradeGross += grossHour;

      // Equity curve: amortized round-trip drag
      equity = equity + grossHour - amortizedFeePerHour;

      // Rebalance — fee on actual drift notional, not a fixed heuristic
      if (price > 0 && entryPrice > 0) {
        const drift = Math.abs((price - entryPrice) / entryPrice) * 100;
        if (drift > strategy.rebalanceThreshold) {
          // Drift notional = fraction of capital that needs to be re-hedged
          const driftNotional = strategy.capitalUSDC * (drift / 100);
          const rebalFee = driftNotional * strategy.takerFee;   // rebalance is always taker
          tradeFees += rebalFee;
          equity    -= rebalFee;
          entryPrice = price;
        }
      }

      const shouldExit =
        rate < strategy.exitRateThreshold ||
        hoursHeld >= strategy.maxHoldHours;

      if (shouldExit) {
        // Taker exit fee charged exactly once on close
        tradeFees += exitFee;
        const net = tradeGross - tradeFees;
        trades.push({
          id: `bt-${tradeIdCounter++}`,
          symbol: tradeSymbol,
          entryTime,
          exitTime: ts,
          hoursHeld,
          entryRate,
          avgRate: tradeGross / hoursHeld / (strategy.capitalUSDC / 2),
          grossFunding: tradeGross,
          fees: tradeFees,
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
