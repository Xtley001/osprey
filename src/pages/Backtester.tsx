import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Play, Save, Trash2, ChevronDown } from 'lucide-react';
import { useBacktestStore } from '../store/backtestStore';
import { useScannerStore } from '../store/scannerStore';
import { formatUSD, formatPct, formatDuration } from '../utils/format';
import type { BacktestParams, StrategyParams, BacktestResult } from '../types/backtest';
import { subDays } from 'date-fns';
import { useBreakpoint } from '../hooks/useBreakpoint';

const BT_DEFAULTS: StrategyParams = {
  entryRateThreshold: 0.0003,
  exitRateThreshold:  0.0001,
  minHoursElevated:   2,
  maxHoldHours:       72,
  capitalUSDC:        5000,
  rebalanceThreshold: 5,
  takerFee:           0.00035,
  makerFee:           0.0001,
};

const MetricsGrid: React.FC<{ result: BacktestResult; mobile?: boolean }> = ({ result: r, mobile }) => {
  const m = r.metrics;
  const items = [
    { label: 'Total Return',   value: formatPct(m.totalReturn),              color: m.totalReturn  >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Net Profit',     value: formatUSD(m.netProfit),                color: m.netProfit    >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Funding Earned', value: formatUSD(m.totalFundingEarned),       color: 'var(--hl-teal)' },
    { label: 'Fees Paid',      value: '−' + formatUSD(m.totalFeesPaid),      color: 'var(--accent-red)' },
    { label: 'Win Rate',       value: m.winRate.toFixed(1) + '%',            color: 'var(--text-primary)' },
    { label: 'Sharpe',         value: m.sharpeRatio.toFixed(2),              color: 'var(--text-primary)' },
    { label: 'Max Drawdown',   value: '−' + m.maxDrawdown.toFixed(2) + '%', color: 'var(--accent-red)' },
    { label: 'Avg Hold',       value: formatDuration(m.avgHoldHours),        color: 'var(--text-primary)' },
    { label: '# Trades',       value: String(m.numTrades),                   color: 'var(--text-primary)' },
    { label: 'Best Trade',     value: formatUSD(m.bestTrade),                color: 'var(--accent-green)' },
    { label: 'Worst Trade',    value: formatUSD(m.worstTrade),               color: 'var(--accent-red)' },
    { label: 'Annualized',     value: formatPct(m.annualizedYield),          color: 'var(--accent-green)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: mobile ? 6 : 'var(--sp-3)' }}>
      {items.map(item => (
        <div key={item.label} className="stat-card" style={{ padding: mobile ? '8px 10px' : undefined }}>
          <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>{item.label}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: mobile ? 13 : 14, fontWeight: 600, color: item.color }}>{item.value}</p>
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
    const H = canvas.offsetHeight || 140;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    const vals = curve.map(p => p.equity);
    const min = Math.min(...vals, initialCapital) * 0.998;
    const max = Math.max(...vals, initialCapital) * 1.002;
    const range = max - min || 1;
    const step = W / (curve.length - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (i / 4) * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const baseY = H - ((initialCapital - min) / range) * H;
    ctx.strokeStyle = 'rgba(67,232,216,0.2)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke(); ctx.setLineDash([]);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(67,232,216,0.15)'); grad.addColorStop(1, 'rgba(67,232,216,0)');
    ctx.fillStyle = grad; ctx.beginPath();
    curve.forEach((p, i) => { const x = i * step; const y = H - ((p.equity - min) / range) * H; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#43e8d8'; ctx.lineWidth = 2; ctx.beginPath();
    curve.forEach((p, i) => { const x = i * step; const y = H - ((p.equity - min) / range) * H; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  }, [curve, initialCapital]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 140, display: 'block' }} />;
};

// Compact mobile trade log — just rows, no wide table
const TradeLogMobile: React.FC<{ result: BacktestResult }> = ({ result }) => (
  <div style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
    {result.trades.map((t, i) => (
      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-sm)' }}>
        <div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginRight: 6 }}>#{i + 1}</span>
          <span style={{ fontWeight: 600, fontSize: 12 }}>{t.symbol}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{formatDuration(t.hoursHeld)}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: t.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {t.net >= 0 ? '+' : ''}{formatUSD(t.net)}
        </span>
      </div>
    ))}
  </div>
);

const TradeLogDesktop: React.FC<{ result: BacktestResult }> = ({ result }) => (
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
            <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: t.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
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
  const { isMobile, isTablet } = useBreakpoint();
  const preSymbol = searchParams.get('symbol') ?? 'BTC';

  const pairs = useScannerStore(s => s.pairs);
  const { result, isRunning, error, runBacktest: run, saveResult, clearResult, savedResults } = useBacktestStore();

  const [symbol, setSymbol]       = useState(preSymbol);
  const [range, setRange]         = useState<'30' | '90' | '180'>('30');
  const [strategy, setStrategy]   = useState<StrategyParams>({ ...BT_DEFAULTS });
  const [formOpen, setFormOpen]   = useState(true);

  const sortedPairs = [...pairs].sort((a, b) => b.openInterest - a.openInterest);

  const handleRun = async () => {
    const endDate   = new Date();
    const startDate = subDays(endDate, parseInt(range));
    if (isMobile) setFormOpen(false); // collapse form to show results
    await run({ symbol, startDate, endDate, strategy, initialCapital: strategy.capitalUSDC, strategyType: 'SINGLE_PAIR' });
  };

  const updateStrat = (key: keyof StrategyParams, rawValue: string, scale = 1) => {
    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed)) setStrategy(s => ({ ...s, [key]: scale !== 1 ? parsed / scale : parsed }));
  };

  const paramRows: { label: string; key: keyof StrategyParams; scale?: number; step: number; min: number; max: number; unit?: string }[] = [
    { label: 'Capital (USDC)',       key: 'capitalUSDC',        step: 500,   min: 500,   max: 100000 },
    { label: 'Entry Rate',           key: 'entryRateThreshold', step: 0.001, min: 0.001, max: 0.5, scale: 100, unit: '%/hr' },
    { label: 'Exit Rate',            key: 'exitRateThreshold',  step: 0.001, min: 0.001, max: 0.5, scale: 100, unit: '%/hr' },
    { label: 'Min Hours Elevated',   key: 'minHoursElevated',   step: 1,     min: 1,     max: 12 },
    { label: 'Max Hold Hours',       key: 'maxHoldHours',       step: 6,     min: 6,     max: 336 },
    { label: 'Rebalance Threshold',  key: 'rebalanceThreshold', step: 1,     min: 1,     max: 20, unit: '%' },
    { label: 'Taker Fee',            key: 'takerFee',           step: 0.001, min: 0.001, max: 0.1, scale: 100, unit: '%' },
  ];

  const FormContent = (
    <>
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Pair</label>
        <select className="input" value={symbol} onChange={e => setSymbol(e.target.value)}>
          {(sortedPairs.length > 0 ? sortedPairs : [{ symbol: 'BTC' }, { symbol: 'ETH' }, { symbol: 'NVDA' }]).map(p => (
            <option key={p.symbol} value={p.symbol}>{p.symbol}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date Range</label>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['30', '90', '180'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              flex: 1, padding: '6px 0', borderRadius: 'var(--r-sm)',
              border: `1px solid ${range === r ? 'var(--hl-teal)' : 'var(--glass-border)'}`,
              background: range === r ? 'var(--hl-teal-dim)' : 'transparent',
              color: range === r ? 'var(--hl-teal)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>{r}d</button>
          ))}
        </div>
      </div>
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
            <input type="number" className="input" step={step} min={min} max={max}
              value={displayVal.toFixed(scale !== 1 ? 3 : 0)}
              onChange={e => updateStrat(key, e.target.value, scale)}
              style={{ height: 32, fontSize: 12 }} />
          </div>
        );
      })}
      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px 0', marginTop: 4 }}
        onClick={handleRun} disabled={isRunning}>
        <Play size={14} />
        {isRunning ? 'Running…' : `Run Backtest (${range}d)`}
      </button>
      {error && (
        <div style={{ marginTop: 10, background: 'rgba(255,79,110,0.08)', border: '1px solid rgba(255,79,110,0.25)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 12 }}>
          <p style={{ color: 'var(--accent-red)', fontWeight: 600, marginBottom: 4 }}>⚠ {error}</p>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px', marginTop: 4 }} onClick={() => useBacktestStore.getState().clearResult()}>Dismiss</button>
        </div>
      )}
    </>
  );

  const ResultActions = result && !isRunning ? (
    <div style={{ display: 'flex', gap: 6 }}>
      {(() => {
        const alreadySaved = savedResults.some(r => r.runAt === result.runAt);
        return (
          <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, opacity: alreadySaved ? 0.5 : 1 }}
            onClick={saveResult} disabled={alreadySaved} title={alreadySaved ? 'Already saved' : 'Save'}>
            <Save size={13} /> {alreadySaved ? 'Saved ✓' : 'Save'}
          </button>
        );
      })()}
      <button className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 12 }} onClick={clearResult}>
        <Trash2 size={13} />
      </button>
    </div>
  ) : null;

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="fade-in" style={{ paddingTop: 'var(--sp-3)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 'var(--sp-3)' }}>Backtester</h1>

        {/* Collapsible form */}
        <div className="glass-card" style={{ marginBottom: 'var(--sp-3)', overflow: 'hidden' }}>
          <button onClick={() => setFormOpen(o => !o)} style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 'var(--sp-4)', color: 'var(--text-primary)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--hl-teal)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Strategy Parameters
            </span>
            <ChevronDown size={14} color="var(--text-muted)" style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {formOpen && <div style={{ padding: '0 var(--sp-4) var(--sp-4)' }}>{FormContent}</div>}
        </div>

        {/* Results */}
        {isRunning && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--hl-teal)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="spin" style={{ width: 24, height: 24, border: '2px solid var(--hl-teal)', borderTopColor: 'transparent', borderRadius: '50%' }} />
            Running backtest on {symbol}…
          </div>
        )}

        {!result && !isRunning && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Play size={28} style={{ opacity: 0.2 }} />
            Configure and tap Run Backtest
          </div>
        )}

        {result && !isRunning && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-3)' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{result.params.symbol} · {range}d</h2>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  Entry {(result.params.strategy.entryRateThreshold * 100).toFixed(3)}%/hr · Hold {result.params.strategy.maxHoldHours}h
                </p>
              </div>
              {ResultActions}
            </div>

            <div className="glass-card" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equity Curve</p>
              <EquityCurve curve={result.equityCurve} initialCapital={result.params.initialCapital} />
            </div>

            <div style={{ marginBottom: 'var(--sp-3)' }}>
              <MetricsGrid result={result} mobile />
            </div>

            {result.trades.length > 0 ? (
              <div className="glass-card" style={{ padding: 'var(--sp-3)' }}>
                <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Trade Log — {result.trades.length} trades
                </p>
                <TradeLogMobile result={result} />
              </div>
            ) : (
              <div className="glass-card" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>No trades triggered.</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Lower the entry rate threshold or extend the date range.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 'var(--sp-5)' }}>Backtester</h1>
      <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '310px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--hl-teal)', marginBottom: 'var(--sp-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Strategy Parameters
          </p>
          {FormContent}
        </div>
        <div>
          {!result && !isRunning && (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, flexDirection: 'column', gap: 10 }}>
              <Play size={36} style={{ opacity: 0.2 }} />
              <span>Configure strategy and click Run Backtest</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>Default settings are calibrated to real HL rate distributions</span>
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
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{result.params.symbol} · {range}d backtest</h2>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Entry {(result.params.strategy.entryRateThreshold * 100).toFixed(3)}%/hr · Max hold {result.params.strategy.maxHoldHours}h · Capital {formatUSD(result.params.initialCapital)}
                  </p>
                </div>
                {ResultActions}
              </div>
              <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equity Curve</p>
                <EquityCurve curve={result.equityCurve} initialCapital={result.params.initialCapital} />
              </div>
              <div style={{ marginBottom: 'var(--sp-3)' }}><MetricsGrid result={result} /></div>
              {result.trades.length > 0 ? (
                <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Trade Log — {result.trades.length} trades
                  </p>
                  <TradeLogDesktop result={result} />
                </div>
              ) : (
                <div className="glass-card" style={{ padding: 'var(--sp-5)', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>No trades triggered.</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Try lowering <strong style={{ color: 'var(--text-secondary)' }}>Entry Rate Threshold</strong> or extending to 90d / 180d.</p>
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
