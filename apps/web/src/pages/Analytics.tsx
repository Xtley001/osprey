/**
 * Analytics — Phase 3 live intelligence.
 * Three sections: Strategy Health, Pair Performance, Persistence Leaders.
 * All data from live stores. No simulation.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePositionStore } from '../store/positionStore';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { useEquityCurveStore } from '../store/equityCurveStore';
import { formatUSD, formatRateRaw, formatPct } from '@osprey/engine';
import { Sparkline } from '../components/shared/Sparkline';
import { useBreakpoint } from '../hooks/useBreakpoint';

const Analytics: React.FC = () => {
  const navigate  = useNavigate();
  const trades    = usePositionStore(s => s.trades);
  const positions = usePositionStore(s => s.positions);
  const allPairs  = useScannerStore(s => s.pairs);
  const regime    = useAppStore(s => s.regime);
  const curve     = useEquityCurveStore(s => s.curve);
  const hwm       = useEquityCurveStore(s => s.highWaterMark);
  const { isMobile } = useBreakpoint();

  // ── Section 1: Strategy Health ─────────────────────────────────────────────
  const totalEarned    = trades.reduce((s, t) => s + t.grossFunding, 0);
  const totalFees      = trades.reduce((s, t) => s + t.fees, 0);
  const openEarning    = positions.reduce((s, p) => s + p.fundingEarned, 0);
  const openFees       = positions.reduce((s, p) => s + p.feesPaid, 0);
  const netProfit      = totalEarned - totalFees + openEarning - openFees;
  const feeEfficiency  = (totalFees + openFees) > 0 ? (totalEarned + openEarning) / (totalFees + openFees) : 0;
  const currentEquity  = curve.length > 0 ? curve[curve.length - 1].cumulativeNet : 0;
  const drawdownPct    = hwm > 0 ? Math.max(0, (hwm - currentEquity) / hwm * 100) : 0;
  const winRate        = trades.length > 0 ? (trades.filter(t => t.net > 0).length / trades.length) * 100 : 0;

  // Rolling 7d Sharpe — CALC_AUDIT.md §11
  const sharpe7d = useMemo(() => {
    const last7d = curve.filter(p => p.timestamp >= Date.now() - 7 * 86_400_000);
    if (last7d.length < 168) return null;
    const returns: number[] = [];
    for (let i = 1; i < last7d.length; i++) {
      if (last7d[i - 1].cumulativeNet !== 0) {
        returns.push(last7d[i].cumulativeNet / last7d[i - 1].cumulativeNet - 1);
      }
    }
    if (returns.length < 2) return null;
    const rf = 0.05 / 8760;
    const excess = returns.map(r => r - rf);
    const mean = excess.reduce((s, v) => s + v, 0) / excess.length;
    const std = Math.sqrt(excess.reduce((s, v) => s + (v - mean) ** 2, 0) / excess.length);
    return std > 0 ? (mean / std) * Math.sqrt(8760) : null;
  }, [curve]);

  // ── Section 2: Pair Performance ────────────────────────────────────────────
  const pairPerf: Record<string, { gross: number; fees: number; net: number; count: number }> = {};
  trades.forEach(t => {
    if (!pairPerf[t.symbol]) pairPerf[t.symbol] = { gross: 0, fees: 0, net: 0, count: 0 };
    pairPerf[t.symbol].gross += t.grossFunding;
    pairPerf[t.symbol].fees  += t.fees;
    pairPerf[t.symbol].net   += t.net;
    pairPerf[t.symbol].count += 1;
  });
  const perfList = Object.entries(pairPerf).sort((a, b) => b[1].net - a[1].net);

  // ── Section 3: Persistence Leaders ─────────────────────────────────────────
  const leaders = [...allPairs]
    .filter(p => p.persistenceHours >= 4)
    .sort((a, b) => b.persistenceHours - a.persistenceHours)
    .slice(0, 10);

  const heatCounts = { fire: 0, hot: 0, warm: 0, cold: 0 };
  allPairs.forEach(p => { heatCounts[p.heat]++; });

  const RegimeCard = (
    <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>Current Regime</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--sp-3)' }}>
        <span style={{ fontSize: 22 }}>{regime.label === 'HOT' ? '🔥' : regime.label === 'NEUTRAL' ? '🌤' : '🧊'}</span>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: regime.label === 'HOT' ? 'var(--accent-orange)' : regime.label === 'NEUTRAL' ? 'var(--hl-teal)' : 'var(--text-muted)' }}>
            {regime.label}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {regime.trend === 'rising' ? '↑ Rising' : regime.trend === 'falling' ? '↓ Falling' : '→ Stable'}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{formatRateRaw(regime.marketAvgRate)}/hr</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{Math.round(regime.breadth * 100)}% elevated</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 'var(--sp-5)' }}>
        Analytics
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 'var(--sp-4)', marginBottom: 'var(--sp-5)' }}>
        {/* ── Section 1: Strategy Health ─────────────────────────────────── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
            Strategy Health
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
            {[
              { label: 'Cumulative Net P&L', value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
              { label: 'Rolling 7d Sharpe', value: sharpe7d !== null ? sharpe7d.toFixed(2) : '—', color: sharpe7d !== null && sharpe7d > 1 ? 'var(--accent-green)' : 'var(--text-muted)', sub: sharpe7d === null ? 'Need 7d data' : undefined },
              { label: 'Fee Efficiency', value: feeEfficiency > 0 ? `${feeEfficiency.toFixed(1)}×` : '—', color: feeEfficiency >= 10 ? 'var(--accent-green)' : feeEfficiency >= 3 ? 'var(--accent-yellow)' : 'var(--text-muted)', sub: 'funding ÷ fees' },
              { label: 'Drawdown from HWM', value: hwm > 0 ? formatPct(-drawdownPct) : '—', color: drawdownPct > 10 ? 'var(--accent-red)' : 'var(--text-muted)' },
              { label: 'Win Rate', value: trades.length > 0 ? formatPct(winRate) : '—', color: winRate > 60 ? 'var(--accent-green)' : winRate > 40 ? 'var(--accent-yellow)' : 'var(--accent-red)' },
            ].map(s => (
              <div key={s.label} className="glass-card" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: s.color }}>{s.value}</p>
                {'sub' in s && s.sub && <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{s.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Regime + heat */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {RegimeCard}
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>Rate Heat Distribution</p>
            {([
              { label: 'Fire (>0.1%/hr)', key: 'fire' as const, color: 'var(--rate-fire)' },
              { label: 'Hot (0.05–0.1%)', key: 'hot' as const, color: 'var(--rate-hot)' },
              { label: 'Warm (0.02–0.05%)', key: 'warm' as const, color: 'var(--rate-warm)' },
              { label: 'Cold (<0.02%)', key: 'cold' as const, color: 'var(--rate-cold)' },
            ] as const).map(item => {
              const count = heatCounts[item.key];
              const pct = allPairs.length > 0 ? (count / allPairs.length) * 100 : 0;
              return (
                <div key={item.key} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
                    <span style={{ color: item.color }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 10 }}>{count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 2: Pair Performance ──────────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
        Pair Performance (All Trades)
      </p>
      {perfList.length === 0 ? (
        <div className="glass-card" style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--text-muted)', marginBottom: 'var(--sp-5)' }}>
          No closed trades yet. Trade history appears here after positions are closed.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--sp-5)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['Symbol', 'Trades', 'Gross Funding', 'Fees', 'Net', '7d Sparkline'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfList.map(([symbol, v]) => {
                const pairData = allPairs.find(p => p.symbol === symbol);
                return (
                  <tr key={symbol} onClick={() => navigate(`/pair/${symbol}`)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background var(--t-fast)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{symbol}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v.count}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-green)' }}>+{formatUSD(v.gross)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-red)' }}>−{formatUSD(v.fees)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: v.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {v.net >= 0 ? '+' : ''}{formatUSD(v.net)}
                    </td>
                    <td style={{ padding: '4px 12px' }}>
                      {pairData && pairData.sparkline7d.length >= 2
                        ? <Sparkline data={pairData.sparkline7d} width={60} height={22} />
                        : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Section 3: Persistence Leaders ───────────────────────────────────── */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Persistence Leaders
      </p>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 'var(--sp-3)' }}>
        Pairs above entry threshold for the longest consecutive time — highest conviction entries.
      </p>
      {leaders.length === 0 ? (
        <div className="glass-card" style={{ padding: 'var(--sp-5)', textAlign: 'center', color: 'var(--text-muted)' }}>
          No pairs with 4+ consecutive hours above entry threshold. Check back when rates are elevated.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                {['#', 'Symbol', 'Persistence', 'Current Rate', 'Signal'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaders.map((pair, i) => (
                <tr key={pair.symbol} onClick={() => navigate(`/pair/${pair.symbol}`)}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background var(--t-fast)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>#{i + 1}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{pair.symbol}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: pair.persistenceHours >= 24 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                    {pair.persistenceHours}h
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={`rate-badge ${pair.heat}`}>{(pair.currentRate * 100).toFixed(4)}%/hr</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--r-sm)',
                      background: 'rgba(0,212,160,0.12)', color: 'var(--accent-green)',
                      border: '1px solid rgba(0,212,160,0.3)',
                    }}>ENTER</span>
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

export default Analytics;
