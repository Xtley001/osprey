import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePositionStore } from '../store/positionStore';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { formatUSD, formatRateRaw, formatPct } from '../utils/format';
import { useBreakpoint } from '../hooks/useBreakpoint';

const MiniBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => (
  <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
    <div style={{ width: `${max > 0 ? (Math.abs(value) / max) * 100 : 0}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
  </div>
);

const Analytics: React.FC = () => {
  const navigate  = useNavigate();
  const trades    = usePositionStore(s => s.trades);
  const positions = usePositionStore(s => s.positions);
  const allPairs  = useScannerStore(s => s.pairs);
  const regime    = useAppStore(s => s.regime);
  const { isMobile } = useBreakpoint();

  const top10  = [...allPairs].sort((a, b) => b.currentRate - a.currentRate).slice(0, 10);
  const bottom5 = [...allPairs].filter(p => p.currentRate < 0).sort((a, b) => a.currentRate - b.currentRate).slice(0, 5);

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

  const totalEarned = trades.reduce((s, t) => s + t.grossFunding, 0);
  const totalFees   = trades.reduce((s, t) => s + t.fees, 0);
  const netProfit   = totalEarned - totalFees;
  const winRate     = trades.length > 0 ? (trades.filter(t => t.net > 0).length / trades.length) * 100 : 0;
  const openEarning = positions.reduce((s, p) => s + p.fundingEarned, 0);

  const heatCounts = { fire: 0, hot: 0, warm: 0, cold: 0 };
  allPairs.forEach(p => { heatCounts[p.heat]++; });

  const summaryStats = [
    { label: 'Funding Earned', value: formatUSD(totalEarned + openEarning), color: 'var(--accent-green)', sub: openEarning > 0 ? `+${formatUSD(openEarning)} open` : undefined },
    { label: 'Fees Paid',      value: '−' + formatUSD(totalFees),           color: 'var(--accent-red)' },
    { label: 'Net Profit',     value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Trades',         value: String(trades.length),                 color: 'var(--text-primary)' },
    { label: 'Win Rate',       value: trades.length > 0 ? formatPct(winRate) : '—', color: winRate > 60 ? 'var(--accent-green)' : winRate > 40 ? 'var(--accent-yellow)' : 'var(--accent-red)' },
  ];

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

  const HeatCard = (
    <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>Rate Heat Distribution</p>
      {([
        { label: 'Fire (>0.1%/hr)',   key: 'fire' as const, color: 'var(--rate-fire)' },
        { label: 'Hot (0.05–0.1%)',   key: 'hot'  as const, color: 'var(--rate-hot)' },
        { label: 'Warm (0.02–0.05%)', key: 'warm' as const, color: 'var(--rate-warm)' },
        { label: 'Cold (<0.02%)',     key: 'cold' as const, color: 'var(--rate-cold)' },
      ] as const).map(item => {
        const count = heatCounts[item.key];
        const pct   = allPairs.length > 0 ? (count / allPairs.length) * 100 : 0;
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
  );

  const Top10Card = (
    <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
        Top 10 Rates Right Now
      </p>
      {top10.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</p>
      ) : top10.map((p, i) => (
        <div key={p.symbol} onClick={() => navigate(`/pair/${p.symbol}`)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < top10.length - 1 ? '1px solid var(--glass-border)' : 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', width: 14 }}>{i + 1}</span>
            <span style={{ fontWeight: 600, fontSize: isMobile ? 12 : 13 }}>{p.symbol}</span>
            {!isMobile && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: p.category === 'TradFi' ? 'rgba(155,109,255,0.15)' : 'rgba(91,141,238,0.1)', color: p.category === 'TradFi' ? 'var(--accent-purple)' : 'var(--accent-blue)' }}>{p.category}</span>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`rate-badge ${p.heat}`} style={{ fontSize: 10 }}>{formatRateRaw(p.currentRate)}/hr</span>
            <p style={{ fontSize: 10, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{(p.annualYield * 100).toFixed(0)}% APY</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fade-in" style={{ paddingTop: isMobile ? 'var(--sp-3)' : 'var(--sp-4)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: isMobile ? 18 : 20, marginBottom: isMobile ? 'var(--sp-3)' : 'var(--sp-5)' }}>Analytics</h1>

      {/* Summary stats — 2-col on mobile, 5-col on desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)',
        gap: isMobile ? 8 : 'var(--sp-3)',
        marginBottom: isMobile ? 'var(--sp-4)' : 'var(--sp-5)',
      }}>
        {summaryStats.map(s => (
          <div key={s.label} className="glass-card" style={{ padding: isMobile ? '10px 12px' : 'var(--sp-4)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 13 : 16, fontWeight: 600, color: s.color }}>{s.value}</p>
            {s.sub && <p style={{ fontSize: 10, color: 'var(--accent-green)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Main content — stacked on mobile, 2-col on desktop */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {RegimeCard}
          {Top10Card}
          {HeatCard}
        </div>
      ) : (
        <div className="grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
          {Top10Card}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            {RegimeCard}
            {HeatCard}
          </div>
        </div>
      )}

      {/* Pair performance */}
      {perfList.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
            Pair Performance — Closed Trades
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {perfList.map(([sym, v]) => (
              <div key={sym} onClick={() => navigate(`/pair/${sym}`)}
                style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: '10px 12px', cursor: 'pointer' }}
                onTouchStart={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onTouchEnd={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{sym}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: v.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
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
        </div>
      )}

      {/* Live positions */}
      {positions.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
            Live Positions ({positions.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--sp-2)' }}>
            {positions.map(p => {
              const net = p.fundingEarned - p.feesPaid;
              return (
                <div key={p.id} onClick={() => navigate(`/pair/${p.symbol}`)}
                  style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.symbol}</span>
                    <span className={`rate-badge ${p.currentRate > 0.0005 ? 'hot' : 'cold'}`} style={{ fontSize: 9 }}>{formatRateRaw(p.currentRate)}</span>
                  </div>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>+{formatUSD(p.fundingEarned)}</p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: 2 }}>Net {net >= 0 ? '+' : ''}{formatUSD(net)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Negative rates */}
      {bottom5.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--sp-4)', borderColor: 'rgba(91,141,238,0.2)' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
            Negative Rates — Long Perp Opportunities
          </p>
          {bottom5.map((p, i) => (
            <div key={p.symbol} onClick={() => navigate(`/pair/${p.symbol}`)}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < bottom5.length - 1 ? '1px solid var(--glass-border)' : 'none', cursor: 'pointer' }}>
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
