import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePositionStore } from '../store/positionStore';
import { useEquityCurveStore } from '../store/equityCurveStore';
import { formatUSD, formatRateRaw, formatDuration, formatPct } from '@osprey/engine';
import { AlertTriangle, RefreshCw, TrendingUp, ExternalLink } from 'lucide-react';
import { toast } from '../components/shared/Toast';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ── Equity curve chart ────────────────────────────────────────────────────────
const EquityCurveChart: React.FC = () => {
  const curve = useEquityCurveStore(s => s.curve);
  const ref   = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || curve.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth; const H = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const teal = getComputedStyle(document.documentElement).getPropertyValue('--hl-teal').trim();

    const values = curve.map(p => p.cumulativeNet);
    const min = Math.min(0, ...values);
    const max = Math.max(...values) * 1.05 || 1;
    const range = max - min;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(67,232,216,0.15)');
    grad.addColorStop(1, 'rgba(67,232,216,0)');

    ctx.beginPath();
    curve.forEach((p, i) => {
      const x = (i / (curve.length - 1)) * W;
      const y = H - ((p.cumulativeNet - min) / range) * H;
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    curve.forEach((p, i) => {
      const x = (i / (curve.length - 1)) * W;
      const y = H - ((p.cumulativeNet - min) / range) * H;
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });
    ctx.strokeStyle = teal; ctx.lineWidth = 1.5; ctx.stroke();
  }, [curve]);

  if (curve.length < 2) {
    return (
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Equity curve populates as funding accrues. Engine must be running with a connected wallet.
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
        Cumulative Net Funding (Live)
      </p>
      <canvas ref={ref} style={{ width: '100%', height: 120, display: 'block' }} />
    </div>
  );
};

const Portfolio: React.FC = () => {
  const navigate   = useNavigate();
  const positions  = usePositionStore(s => s.positions);
  const trades     = usePositionStore(s => s.trades);
  const closePos   = usePositionStore(s => s.closePosition);
  const clearAll   = usePositionStore(s => s.clearAll);

  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const { isMobile } = useBreakpoint();

  const openFunding   = positions.reduce((s, p) => s + p.fundingEarned, 0);
  const openFees      = positions.reduce((s, p) => s + p.feesPaid, 0);
  const closedFunding = trades.reduce((s, t) => s + t.grossFunding, 0);
  const closedFees    = trades.reduce((s, t) => s + t.fees, 0);
  const totalFunding  = openFunding + closedFunding;
  const totalFees     = openFees + closedFees;
  const netProfit     = totalFunding - totalFees;
  const winRate       = trades.length > 0
    ? (trades.filter(t => t.net > 0).length / trades.length) * 100
    : 0;

  // Fee efficiency — CALC_AUDIT.md §2.5
  const feeEfficiency = totalFees > 0 ? totalFunding / totalFees : 0;

  // Best/worst pair this month
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0);
  const monthTrades = trades.filter(t => t.exitTime >= thisMonthStart.getTime());
  const pairNets: Record<string, number> = {};
  monthTrades.forEach(t => { pairNets[t.symbol] = (pairNets[t.symbol] ?? 0) + t.net; });
  const sortedPairs = Object.entries(pairNets).sort((a, b) => b[1] - a[1]);
  const bestPair  = sortedPairs[0];
  const worstPair = sortedPairs[sortedPairs.length - 1];

  const handleClose = (id: string) => {
    closePos(id);
    toast.success('Position closed');
    setConfirmClose(null);
  };

  const exportCSV = () => {
    const rows = [
      ['Symbol', 'Entry Time', 'Exit Time', 'Hours Held', 'Gross Funding', 'Fees', 'Net'],
      ...trades.map(t => [
        t.symbol,
        new Date(t.entryTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        t.hoursHeld.toFixed(2),
        t.grossFunding.toFixed(4),
        t.fees.toFixed(4),
        t.net.toFixed(4),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'osprey_trades.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Trade history exported');
  };

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>Portfolio</h1>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-sm)', fontWeight: 700,
            background: 'rgba(245,197,66,0.12)', color: 'var(--accent-yellow)',
            border: '1px solid rgba(245,197,66,0.25)',
          }}>
            LIVE
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {trades.length > 0 && (
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={exportCSV}>
              <ExternalLink size={13} /> Export CSV
            </button>
          )}
          {(positions.length > 0 || trades.length > 0) && (
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', color: 'var(--accent-red)' }} onClick={() => {
              clearAll();
              toast.info('Portfolio cleared');
            }}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Equity curve (Phase 2) */}
      <EquityCurveChart />

      {/* Summary cards */}
      <div className="grid-stats" style={{ marginBottom: 'var(--sp-5)' }}>
        {[
          { label: 'Total Funding',   value: '+' + formatUSD(totalFunding),  color: 'var(--accent-green)' },
          { label: 'Total Fees',      value: '−' + formatUSD(totalFees),     color: 'var(--accent-red)' },
          { label: 'Net Profit',      value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
          { label: 'Win Rate',        value: trades.length > 0 ? formatPct(winRate) : '—', color: 'var(--text-primary)' },
          {
            label: 'Fee Efficiency',
            value: feeEfficiency > 0 ? `${feeEfficiency.toFixed(1)}×` : '—',
            color: feeEfficiency >= 10 ? 'var(--accent-green)' : feeEfficiency >= 3 ? 'var(--accent-yellow)' : 'var(--accent-red)',
            sub: 'funding ÷ total fees',
          },
        ].map(s => (
          <div key={s.label} className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{s.label}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: s.color }}>{s.value}</p>
            {'sub' in s && s.sub && <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Best/worst pair this month */}
      {sortedPairs.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {bestPair && (
            <div className="glass-card" style={{ padding: 'var(--sp-3) var(--sp-4)', flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Best (this month)</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{bestPair[0]}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-green)' }}>+{formatUSD(bestPair[1])}</p>
            </div>
          )}
          {worstPair && worstPair[0] !== bestPair?.[0] && (
            <div className="glass-card" style={{ padding: 'var(--sp-3) var(--sp-4)', flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Worst (this month)</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{worstPair[0]}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-red)' }}>{formatUSD(worstPair[1])}</p>
            </div>
          )}
        </div>
      )}

      {/* Open positions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Open Positions ({positions.length})
        </h2>
        {positions.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
            <TrendingUp size={11} style={{ display: 'inline', marginRight: 4 }} />
            +{formatUSD(openFunding)} accruing
          </span>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="glass-card" style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-muted)', marginBottom: 'var(--sp-5)' }}>
          <p style={{ marginBottom: 8 }}>No open positions.</p>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => navigate('/')}>
            Go to Scanner →
          </button>
        </div>
      ) : (
        <div className="table-wrap" style={{ background: 'var(--bg-surface)', marginBottom: 'var(--sp-5)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Pair', 'Entry', 'Notional', 'Rate', 'Funding', 'Fees', 'Net PnL', 'Held', 'Drift', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map(p => {
                const net = p.fundingEarned - p.feesPaid;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600, fontSize: 13 }}>
                      <button onClick={() => navigate(`/pair/${p.symbol}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-display)', padding: 0 }}>
                        {p.symbol}
                      </button>
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(p.entryTime).toLocaleString()}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatUSD(p.notional)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatRateRaw(p.currentRate)}/hr</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-green)' }}>+{formatUSD(p.fundingEarned)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-red)' }}>−{formatUSD(p.feesPaid)}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {net >= 0 ? '+' : ''}{formatUSD(net)}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatDuration(p.hoursHeld)}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11 }}>
                      {p.hedgeDrift > 2 ? (
                        <span style={{ color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <AlertTriangle size={10} />{p.hedgeDrift.toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--accent-green)', fontSize: 10 }}>✓ {p.hedgeDrift.toFixed(1)}%</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {confirmClose === p.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => handleClose(p.id)}>Confirm</button>
                          <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setConfirmClose(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 10 }}>
                            <RefreshCw size={10} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setConfirmClose(p.id)}>
                            Close
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Trade history */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Trade History ({trades.length})
        </h2>
      </div>

      {trades.length === 0 ? (
        <div className="glass-card" style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--text-muted)' }}>
          No closed trades yet. Enable the harvest engine to start opening positions.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Pair', 'Entry', 'Exit', 'Held', 'Avg Rate', 'Gross', 'Fees', 'Net'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...trades].reverse().map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{new Date(t.entryTime).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{new Date(t.exitTime).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatDuration(t.hoursHeld)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{(t.avgRate * 100).toFixed(4)}%</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-green)' }}>+{formatUSD(t.grossFunding)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-red)' }}>−{formatUSD(t.fees)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: t.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {t.net >= 0 ? '+' : ''}{formatUSD(t.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Portfolio;
