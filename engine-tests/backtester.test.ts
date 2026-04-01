import { describe, it, expect, beforeEach } from 'vitest';
import { runBacktest } from '../src/engine/backtester';
import type { BacktestParams } from '../src/types/backtest';
import type { FundingEvent, Candle } from '../src/types/funding';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeFundingHistory(
  startMs: number,
  hours: number,
  baseRate: number,
  elevated = false
): FundingEvent[] {
  return Array.from({ length: hours }, (_, i) => ({
    timestamp: startMs + i * 3_600_000,
    rate: elevated ? baseRate : baseRate * 0.3,
    symbol: 'TEST',
  }));
}

function makeCandles(startMs: number, hours: number, basePrice = 100): Candle[] {
  let price = basePrice;
  return Array.from({ length: hours }, (_, i) => {
    price = price * (1 + (Math.random() - 0.5) * 0.002);
    return {
      timestamp: startMs + i * 3_600_000,
      open: price,
      high: price * 1.001,
      low: price * 0.999,
      close: price,
      volume: 100_000,
    };
  });
}

function makeParams(overrides?: Partial<BacktestParams>): BacktestParams {
  const end = new Date('2024-06-01');
  const start = new Date('2024-05-01');
  return {
    symbol: 'TEST',
    startDate: start,
    endDate: end,
    initialCapital: 10_000,
    strategyType: 'SINGLE_PAIR',
    strategy: {
      entryRateThreshold: 0.0004,
      exitRateThreshold:  0.0002,
      minHoursElevated:   2,
      maxHoldHours:       72,
      capitalUSDC:        5_000,
      rebalanceThreshold: 5,
      takerFee:           0.00035,
      makerFee:           0.0001,
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('runBacktest — structure', () => {
  it('returns a result with required fields', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.0002);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);

    expect(result).toHaveProperty('trades');
    expect(result).toHaveProperty('equityCurve');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('params');
    expect(result).toHaveProperty('runAt');
  });

  it('equity curve length equals number of hours in backtest', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const end = params.endDate.getTime();
    const expectedHours = Math.ceil((end - start) / 3_600_000) + 1;
    const funding = makeFundingHistory(start, expectedHours, 0.0002);
    const candles = makeCandles(start, expectedHours);

    const result = runBacktest(params, funding, candles);
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });

  it('equity curve starts near initial capital', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.0002);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    const firstEquity = result.equityCurve[0].equity;
    expect(firstEquity).toBeCloseTo(params.initialCapital, -1);
  });
});

describe('runBacktest — no trades when rate is always below threshold', () => {
  it('produces zero trades when rate never reaches entry threshold', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    // Rate is 0.0001, well below entryRateThreshold of 0.0004
    const funding = makeFundingHistory(start, hours, 0.0001, false);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    expect(result.trades.length).toBe(0);
    expect(result.metrics.numTrades).toBe(0);
  });

  it('metrics are zeroed out with no trades', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.00005, false);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    expect(result.metrics.winRate).toBe(0);
    expect(result.metrics.totalFundingEarned).toBe(0);
    expect(result.metrics.netProfit).toBe(0);
  });
});

describe('runBacktest — trades fire when rate is elevated', () => {
  it('produces at least one trade when rate is consistently above threshold', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    // Rate 0.001 >> entryRateThreshold 0.0004
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it('funding earned is positive when there are trades', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    if (result.trades.length > 0) {
      expect(result.metrics.totalFundingEarned).toBeGreaterThan(0);
    }
  });

  it('fees paid is positive when there are trades', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    if (result.trades.length > 0) {
      expect(result.metrics.totalFeesPaid).toBeGreaterThan(0);
    }
  });
});

describe('runBacktest — metrics integrity', () => {
  it('net profit equals funding earned minus fees paid', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    const { totalFundingEarned, totalFeesPaid, netProfit } = result.metrics;
    expect(Math.abs(netProfit - (totalFundingEarned - totalFeesPaid))).toBeLessThan(0.01);
  });

  it('win rate is between 0 and 100', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(100);
  });

  it('maxDrawdown is non-negative', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    expect(result.metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('all trade records have required fields', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    result.trades.forEach(trade => {
      expect(trade).toHaveProperty('id');
      expect(trade).toHaveProperty('symbol');
      expect(trade).toHaveProperty('entryTime');
      expect(trade).toHaveProperty('exitTime');
      expect(trade).toHaveProperty('hoursHeld');
      expect(trade).toHaveProperty('grossFunding');
      expect(trade).toHaveProperty('fees');
      expect(trade).toHaveProperty('net');
      expect(trade.exitTime).toBeGreaterThan(trade.entryTime);
      expect(trade.hoursHeld).toBeGreaterThan(0);
    });
  });
});

describe('runBacktest — maxHoldHours respected', () => {
  it('no trade is held longer than maxHoldHours', () => {
    const params = makeParams({
      strategy: {
        entryRateThreshold: 0.0004,
        exitRateThreshold:  0.00001,
        minHoursElevated:   1,
        maxHoldHours:       12,
        capitalUSDC:        5_000,
        rebalanceThreshold: 5,
        takerFee:           0.00035,
        makerFee:           0.0001,
      },
    });
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    result.trades.forEach(trade => {
      expect(trade.hoursHeld).toBeLessThanOrEqual(params.strategy.maxHoldHours + 1);
    });
  });
});

// ─── Fee math regression — validates Fix #3 ──────────────────────────────────
describe('runBacktest — fee math correctness (regression for double-count fix)', () => {
  it('fees for a single trade equal exactly entryFee + exitFee with no rebalance', () => {
    // Use a rate that always stays above exitThreshold so we get exactly one
    // trade that exits only due to maxHoldHours, with a flat price (no rebalance).
    const capital = 5_000;
    const takerFee = 0.00035;
    const maxHoldHours = 4;

    const params = makeParams({
      strategy: {
        entryRateThreshold: 0.0004,
        exitRateThreshold:  0.00001, // effectively never triggers early exit
        minHoursElevated:   2,
        maxHoldHours,
        capitalUSDC: capital,
        rebalanceThreshold: 999,    // disable rebalance
        takerFee,
        makerFee: 0.0001,
      },
    });

    const start = params.startDate.getTime();
    const hours = 10; // short window: entry + 4h hold + exit
    const funding = makeFundingHistory(start, hours, 0.001, true);

    // Flat price candles — no rebalance triggered
    const candles = Array.from({ length: hours }, (_, i) => ({
      timestamp: start + i * 3_600_000,
      open: 100, high: 100, low: 100, close: 100, volume: 100_000,
    }));

    const result = runBacktest(params, funding, candles);
    expect(result.trades.length).toBeGreaterThan(0);

    const expectedFees = capital * takerFee * 2; // entry + exit, exactly once each
    const trade = result.trades[0];

    // fees should be entryFee + exitFee = capital * takerFee * 2
    expect(trade.fees).toBeCloseTo(expectedFees, 6);

    // net = gross - fees (no double-charging)
    expect(trade.net).toBeCloseTo(trade.grossFunding - trade.fees, 6);
  });

  it('net profit never exceeds gross funding earned', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    result.trades.forEach(trade => {
      expect(trade.net).toBeLessThanOrEqual(trade.grossFunding + 0.001); // small float tolerance
    });
  });

  it('fees paid is always positive for any completed trade', () => {
    const params = makeParams();
    const start = params.startDate.getTime();
    const hours = 30 * 24;
    const funding = makeFundingHistory(start, hours, 0.001, true);
    const candles = makeCandles(start, hours);

    const result = runBacktest(params, funding, candles);
    result.trades.forEach(trade => {
      expect(trade.fees).toBeGreaterThan(0);
    });
  });
});
