import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePositionStore } from '../store/positionStore';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { formatUSD, formatRateRaw, formatPct } from '../utils/format';

const MiniBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => (
  <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 2, height: 6, overflow: 'hidden' }}>
    <div style={{ width: `${max > 0 ? (Math.abs(value) / max) * 100 : 0}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
  </div>
);

const Analytics: React.FC = () => {
  const navigate   = useNavigate();
  const trades     = usePositionStore(s => s.trades);
  const positions  = usePositionStore(s => s.positions);
  const allPairs   = useScannerStore(s => s.pairs);
  const regime     = useAppStore(s => s.regime);

  const top10      = [...allPairs].sort((a, b) => b.currentRate - a.currentRate).slice(0, 10);
  const bottom5    = [...allPairs].filter(p => p.currentRate < 0).sort((a, b) => a.currentRate - b.currentRate).slice(0, 5);

  // Pair performance from closed trades
  const pairPerf: Record<string, { gross: number; fees: number; net: number; count: number }> = {};
  trades.forEach(t => {
    if (!pairPerf[t.symbol]) pairPerf[t.symbol] = { gross: 0, fees: 0, net: 0, count: 0 };
    pairPerf[t.symbol].gross += t.grossFunding;
    pairPerf[t.symbol].fees  += t.fees;
    pairPerf[t.symbol].net   += t.net;
    pairPerf[t.symbol].count += 1;
  });
  const perfList = Object.entries(pairPerf).sort((a, b) => b[1].net - a[1].net);
  const maxNet   = Math.max(...perfList.map(([, v]) => Math.abs(v.net)), 1);

  const totalEarned  = trades.reduce((s, t) => s + t.grossFunding, 0);
  const totalFees    = trades.reduce((s, t) => s + t.fees, 0);
  const netProfit    = totalEarned - totalFees;
  const winRate      = trades.length > 0 ? (trades.filter(t => t.net > 0).length / trades.length) * 100 : 0;
  const openEarning  = positions.reduce((s, p) => s + p.fundingEarned, 0);

  // Rate heat distribution
  const heatCounts = { fire: 0, hot: 0, warm: 0, cold: 0 };
  allPairs.forEach(p => { heatCounts[p.heat]++; });

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 'var(--sp-5)' }}>Analytics</h1>

      {/* Summary row */}
      <div className="grid-stats" style={{ marginBottom: 'var(--sp-5)' }}>
        {[
          { label: 'Total Funding Earned', value: formatUSD(totalEarned + openEarning), color: 'var(--accent-green)', sub: openEarning > 0 ? `+${formatUSD(openEarning)} open` : undefined },
          { label: 'Total Fees Paid',      value: '−' + formatUSD(totalFees),      color: 'var(--accent-red)' },
          { label: 'Net Profit',           value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
          { label: 'Closed Trades',        value: String(trades.length),            color: 'var(--text-primary)' },
          { label: 'Win Rate',             value: trades.length > 0 ? formatPct(winRate) : '—', color: winRate > 60 ? 'var(--accent-green)' : winRate > 40 ? 'var(--accent-yellow)' : 'var(--accent-red)' },
        ].map(s => (
          <div key={s.label} className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>{s.label}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: s.color }}>{s.value}</p>
            {s.sub && <p style={{ fontSize: 10, color: 'var(--accent-green)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--sp-4)' }}>

        {/* Top 10 rates */}
        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-4)' }}>
            Top 10 Rates Right Now
          </p>
          {top10.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</p>
          ) : top10.map((p, i) => (
            <div
              key={p.symbol}
              onClick={() => navigate(`/pair/${p.symbol}`)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < top10.length - 1 ? '1px solid var(--glass-border)' : 'none', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', width: 14 }}>{i + 1}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.symbol}</span>
                <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: p.category === 'TradFi' ? 'rgba(155,109,255,0.15)' : 'rgba(91,141,238,0.1)', color: p.category === 'TradFi' ? 'var(--accent-purple)' : 'var(--accent-blue)' }}>{p.category}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`rate-badge ${p.heat}`} style={{ fontSize: 10 }}>{formatRateRaw(p.currentRate)}/hr</span>
                <p style={{ fontSize: 10, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{(p.annualYield * 100).toFixed(0)}% APY</p>
              </div>
            </div>
          ))}
        </div>

        {/* Right column: heat distribution + regime + pair performance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

          {/* Regime card */}
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>Current Regime</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--sp-3)' }}>
              <span style={{ fontSize: 24 }}>{regime.label === 'HOT' ? '🔥' : regime.label === 'NEUTRAL' ? '🌤' : '🧊'}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, color: regime.label === 'HOT' ? 'var(--accent-orange)' : regime.label === 'NEUTRAL' ? 'var(--hl-teal)' : 'var(--text-muted)' }}>
                  {regime.label}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {regime.trend === 'rising' ? '↑ Rising' : regime.trend === 'falling' ? '↓ Falling' : '→ Stable'} · {regime.hoursInRegime}h in regime
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="stat-card" style={{ padding: '8px 12px' }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Market Avg Rate</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{formatRateRaw(regime.marketAvgRate)}/hr</p>
              </div>
              <div className="stat-card" style={{ padding: '8px 12px' }}>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Breadth</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{Math.round(regime.breadth * 100)}% elevated</p>
              </div>
            </div>
          </div>

          {/* Heat distribution */}
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>Rate Heat Distribution</p>
            {[
              { label: 'Fire (>0.1%/hr)', key: 'fire' as const, color: 'var(--rate-fire)' },
              { label: 'Hot (0.05–0.1%)', key: 'hot'  as const, color: 'var(--rate-hot)' },
              { label: 'Warm (0.02–0.05%)', key: 'warm' as const, color: 'var(--rate-warm)' },
              { label: 'Cold (<0.02%)', key: 'cold' as const, color: 'var(--rate-cold)' },
            ].map(item => {
              const count = heatCounts[item.key];
              const pct   = allPairs.length > 0 ? (count / allPairs.length) * 100 : 0;
              return (
                <div key={item.key} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 11 }}>
                    <span style={{ color: item.color }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 10 }}>{count} pairs ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pair performance from closed trades */}
      <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-4)' }}>
          Pair Performance — Closed Trades
        </p>
        {perfList.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No closed trades yet. Open a position from the Scanner and close it to see performance here.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {perfList.map(([sym, v]) => (
              <div key={sym} onClick={() => navigate(`/pair/${sym}`)} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: '10px 12px', cursor: 'pointer', transition: 'background var(--t-fast)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{sym}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: v.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {v.net >= 0 ? '+' : ''}{formatUSD(v.net)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MiniBar value={v.net} max={maxNet} color={v.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{v.count} trades</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live positions */}
      {positions.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
            Live Positions ({positions.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--sp-3)' }}>
            {positions.map(p => {
              const net = p.fundingEarned - p.feesPaid;
              return (
                <div key={p.id} onClick={() => navigate(`/pair/${p.symbol}`)} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{p.symbol}</span>
                    <span className={`rate-badge ${p.currentRate > 0.0005 ? 'hot' : 'cold'}`} style={{ fontSize: 9, padding: '1px 5px' }}>{formatRateRaw(p.currentRate)}</span>
                  </div>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>+{formatUSD(p.fundingEarned)} earned</p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: 2 }}>Net {net >= 0 ? '+' : ''}{formatUSD(net)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Negative rates */}
      {bottom5.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-4)', borderColor: 'rgba(91,141,238,0.2)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
            Negative Rates — Long Perp Opportunities
          </p>
          {bottom5.map((p, i) => (
            <div key={p.symbol} onClick={() => navigate(`/pair/${p.symbol}`)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < bottom5.length - 1 ? '1px solid var(--glass-border)' : 'none', cursor: 'pointer' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{p.symbol}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-blue)' }}>{formatRateRaw(p.currentRate)}/hr</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Analytics;
