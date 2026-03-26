import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Play, Save, Trash2, ChevronDown } from 'lucide-react';
import { useBacktestStore } from '../store/backtestStore';
import { useScannerStore } from '../store/scannerStore';
import { formatUSD, formatPct, formatDuration } from '../utils/format';
import type { BacktestParams, StrategyParams, BacktestResult } from '../types/backtest';
import { subDays } from 'date-fns';

// Sensible defaults matching real HL rate distribution
const BT_DEFAULTS: StrategyParams = {
  entryRateThreshold: 0.0003,   // 0.03%/hr — realistic entry bar
  exitRateThreshold:  0.0001,   // 0.01%/hr
  minHoursElevated:   2,
  maxHoldHours:       72,
  capitalUSDC:        5000,
  rebalanceThreshold: 5,
  takerFee:           0.00035,
  makerFee:           0.0001,
};

const MetricsGrid: React.FC<{ result: BacktestResult }> = ({ result: r }) => {
  const m = r.metrics;
  const items = [
    { label: 'Total Return',    value: formatPct(m.totalReturn),            color: m.totalReturn  >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Net Profit',      value: formatUSD(m.netProfit),              color: m.netProfit    >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Funding Earned',  value: formatUSD(m.totalFundingEarned),     color: 'var(--hl-teal)'   },
    { label: 'Fees Paid',       value: '−' + formatUSD(m.totalFeesPaid),    color: 'var(--accent-red)' },
    { label: 'Win Rate',        value: m.winRate.toFixed(1) + '%',          color: 'var(--text-primary)' },
    { label: 'Sharpe Ratio',    value: m.sharpeRatio.toFixed(2),            color: 'var(--text-primary)' },
    { label: 'Max Drawdown',    value: '−' + m.maxDrawdown.toFixed(2) + '%', color: 'var(--accent-red)' },
    { label: 'Avg Hold',        value: formatDuration(m.avgHoldHours),      color: 'var(--text-primary)' },
    { label: '# Trades',        value: String(m.numTrades),                 color: 'var(--text-primary)' },
    { label: 'Best Trade',      value: formatUSD(m.bestTrade),              color: 'var(--accent-green)' },
    { label: 'Worst Trade',     value: formatUSD(m.worstTrade),             color: 'var(--accent-red)' },
    { label: 'Annualized',      value: formatPct(m.annualizedYield),        color: 'var(--accent-green)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)' }}>
      {items.map(item => (
        <div key={item.label} className="stat-card">
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</p>
        </div>
      ))}
    </div>
  );
};

const EquityCurve: React.FC<{ curve: { timestamp: number; equity: number }[]; initialCapital: number }> = ({ curve, initialCapital }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || curve.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.offsetWidth || 600;
    const H = 180;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    const vals = curve.map(p => p.equity);
    const min = Math.min(...vals, initialCapital) * 0.998;
    const max = Math.max(...vals, initialCapital) * 1.002;
    const range = max - min || 1;
    const step = W / (curve.length - 1);
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (i / 4) * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // Baseline
    const baseY = H - ((initialCapital - min) / range) * H;
    ctx.strokeStyle = 'rgba(67,232,216,0.2)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();
    ctx.setLineDash([]);
    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(67,232,216,0.15)'); grad.addColorStop(1, 'rgba(67,232,216,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    curve.forEach((p, i) => { const x = i * step; const y = H - ((p.equity - min) / range) * H; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // Line
    ctx.strokeStyle = 'var(--hl-teal)'; ctx.lineWidth = 2;
    ctx.beginPath();
    curve.forEach((p, i) => { const x = i * step; const y = H - ((p.equity - min) / range) * H; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  }, [curve, initialCapital]);
  return <canvas ref={canvasRef} height={180} style={{ width: '100%', display: 'block' }} />;
};

const TradeLog: React.FC<{ result: BacktestResult }> = ({ result }) => (
  <div style={{ maxHeight: 260, overflow: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
          {['#', 'Symbol', 'Entry', 'Exit', 'Held', 'Avg Rate', 'Gross', 'Fees', 'Net'].map(h => (
            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.trades.map((t, i) => (
          <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{i + 1}</td>
            <td style={{ padding: '5px 10px', fontWeight: 600 }}>{t.symbol}</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{new Date(t.entryTime).toLocaleDateString()}</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{new Date(t.exitTime).toLocaleDateString()}</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)' }}>{formatDuration(t.hoursHeld)}</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)' }}>{(t.avgRate * 100).toFixed(4)}%</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>+{formatUSD(t.grossFunding)}</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>−{formatUSD(t.fees)}</td>
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', color: t.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {t.net >= 0 ? '+' : ''}{formatUSD(t.net)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Backtester: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preSymbol = searchParams.get('symbol') ?? 'BTC';

  const pairs = useScannerStore(s => s.pairs);
  const { result, isRunning, error, runBacktest: run, saveResult, clearResult } = useBacktestStore();

  const [symbol, setSymbol]     = useState(preSymbol);
  const [range, setRange]       = useState<'30' | '90' | '180'>('30');
  const [strategy, setStrategy] = useState<StrategyParams>({ ...BT_DEFAULTS });

  // Sorted pairs for dropdown — by OI descending, major pairs first
  const sortedPairs = [...pairs].sort((a, b) => b.openInterest - a.openInterest);

  const handleRun = async () => {
    const endDate   = new Date();
    const startDate = subDays(endDate, parseInt(range));
    await run({ symbol, startDate, endDate, strategy, initialCapital: strategy.capitalUSDC, strategyType: 'SINGLE_PAIR' });
  };

  // Numeric input helper — converts display value back to internal decimal
  type StratNumKey = keyof { [K in keyof StrategyParams]: StrategyParams[K] extends number ? K : never };
  const updateStrat = (key: keyof StrategyParams, rawValue: string, scale = 1) => {
    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed)) {
      setStrategy(s => ({ ...s, [key]: scale !== 1 ? parsed / scale : parsed }));
    }
  };

  const paramRows: { label: string; key: keyof StrategyParams; scale?: number; step: number; min: number; max: number; unit?: string }[] = [
    { label: 'Capital (USDC)',          key: 'capitalUSDC',        step: 500,  min: 500,   max: 100000 },
    { label: 'Entry Rate Threshold',    key: 'entryRateThreshold', step: 0.001, min: 0.001, max: 0.5, scale: 100, unit: '%/hr' },
    { label: 'Exit Rate Threshold',     key: 'exitRateThreshold',  step: 0.001, min: 0.001, max: 0.5, scale: 100, unit: '%/hr' },
    { label: 'Min Hours Elevated',      key: 'minHoursElevated',   step: 1,    min: 1,     max: 12 },
    { label: 'Max Hold Hours',          key: 'maxHoldHours',       step: 6,    min: 6,     max: 336 },
    { label: 'Rebalance Threshold',     key: 'rebalanceThreshold', step: 1,    min: 1,     max: 20, unit: '%' },
    { label: 'Taker Fee',               key: 'takerFee',           step: 0.001, min: 0.001, max: 0.1, scale: 100, unit: '%' },
  ];

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 'var(--sp-5)' }}>Backtester</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
        {/* Form */}
        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--hl-teal)', marginBottom: 'var(--sp-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Strategy Parameters
          </p>

          {/* Pair */}
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Pair</label>
            <select className="input" value={symbol} onChange={e => setSymbol(e.target.value)}>
              {(sortedPairs.length > 0 ? sortedPairs : [{ symbol: 'BTC' }, { symbol: 'ETH' }, { symbol: 'NVDA' }]).map(p => (
                <option key={p.symbol} value={p.symbol}>{p.symbol}</option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date Range</label>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['30', '90', '180'] as const).map(r => (
                <button key={r} onClick={() => setRange(r)} style={{
                  flex: 1, padding: '5px 0', borderRadius: 'var(--r-sm)',
                  border: `1px solid ${range === r ? 'var(--hl-teal)' : 'var(--glass-border)'}`,
                  background: range === r ? 'var(--hl-teal-dim)' : 'transparent',
                  color: range === r ? 'var(--hl-teal)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-display)',
                }}>{r}d</button>
              ))}
            </div>
          </div>

          {/* Strategy params */}
          {paramRows.map(({ label, key, scale = 1, step, min, max, unit }) => {
            const raw = strategy[key] as number;
            const displayVal = scale !== 1 ? (raw * scale) : raw;
            return (
              <div key={key} style={{ marginBottom: 'var(--sp-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>
                    {displayVal.toFixed(scale !== 1 ? 3 : 0)}{unit ?? ''}
                  </span>
                </div>
                <input
                  type="number" className="input"
                  step={step} min={min} max={max}
                  value={displayVal.toFixed(scale !== 1 ? 3 : 0)}
                  onChange={e => updateStrat(key, e.target.value, scale)}
                  style={{ height: 30, fontSize: 12 }}
                />
              </div>
            );
          })}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0', marginTop: 4 }}
            onClick={handleRun}
            disabled={isRunning}
          >
            <Play size={14} />
            {isRunning ? 'Running…' : `Run Backtest (${range}d)`}
          </button>

          {error && (
            <p style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-red)' }}>Error: {error}</p>
          )}
        </div>

        {/* Results */}
        <div>
          {!result && !isRunning && (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, flexDirection: 'column', gap: 10 }}>
              <Play size={36} style={{ opacity: 0.2 }} />
              <span>Configure strategy and click Run Backtest</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
                Try default settings — they're calibrated to real HL rate distributions
              </span>
            </div>
          )}

          {isRunning && (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hl-teal)', fontSize: 13, gap: 10 }}>
              <div className="spin" style={{ width: 20, height: 20, border: '2px solid var(--hl-teal)', borderTopColor: 'transparent', borderRadius: '50%' }} />
              Running backtest on {symbol}…
            </div>
          )}

          {result && !isRunning && (
            <div className="fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
                    {result.params.symbol} · {range}d backtest
                  </h2>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Entry threshold {(result.params.strategy.entryRateThreshold * 100).toFixed(3)}%/hr ·
                    Max hold {result.params.strategy.maxHoldHours}h ·
                    Capital {formatUSD(result.params.initialCapital)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }} onClick={saveResult}>
                    <Save size={13} /> Save
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={clearResult}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Equity Curve
                </p>
                <EquityCurve curve={result.equityCurve} initialCapital={result.params.initialCapital} />
              </div>

              <div style={{ marginBottom: 'var(--sp-3)' }}>
                <MetricsGrid result={result} />
              </div>

              {result.trades.length > 0 ? (
                <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Trade Log — {result.trades.length} trades
                  </p>
                  <TradeLog result={result} />
                </div>
              ) : (
                <div className="glass-card" style={{ padding: 'var(--sp-5)', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>No trades triggered.</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    Try lowering <strong style={{ color: 'var(--text-secondary)' }}>Entry Rate Threshold</strong> below the pair's average rate,
                    or extending the date range to 90d / 180d.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Backtester;
