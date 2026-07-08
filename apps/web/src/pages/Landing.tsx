import React, { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bird, ArrowRight, Search, Zap, Wallet, ShieldCheck, Scale, Github } from 'lucide-react';
import { useScannerStore } from '../store/scannerStore';
import { formatUSD } from '@osprey/engine';
import { Sparkline } from '../components/shared/Sparkline';
import { useBreakpoint } from '../hooks/useBreakpoint';

const EXT = { target: '_blank', rel: 'noopener noreferrer' } as const;

// ── Top navigation ──────────────────────────────────────────────────────────
const LandingNav: React.FC = () => (
  <header style={{
    position: 'sticky', top: 0, zIndex: 50,
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    background: 'rgba(7,8,11,0.72)', borderBottom: '1px solid var(--c-800)',
  }}>
    <div style={{
      maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 64,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
        <Bird size={22} color="var(--accent)" />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--w-000)', letterSpacing: '-0.02em' }}>OSPREY</span>
      </Link>
      <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Link to="/docs" className="btn btn-ghost btn-sm" style={{ border: 'none' }}>Docs</Link>
        <Link to="/app" className="btn btn-ghost btn-sm" style={{ border: 'none' }}>Scanner</Link>
        <Link to="/app" className="btn btn-primary btn-sm">Launch App</Link>
      </nav>
    </div>
  </header>
);

// ── Hero live-stat tile ─────────────────────────────────────────────────────
const HeroStat: React.FC<{ label: string; value: React.ReactNode; loading?: boolean }> = ({ label, value, loading }) => (
  <div style={{
    flex: 1, minWidth: 130, padding: '14px 18px',
    background: 'var(--grad-surface)', border: '1px solid var(--c-700)', borderRadius: 'var(--r-lg)',
  }}>
    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--w-300)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</p>
    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--w-000)', fontVariantNumeric: 'tabular-nums' }}>
      {loading ? <span className="skeleton" style={{ display: 'inline-block', width: 72, height: 20, borderRadius: 6 }} /> : value}
    </p>
  </div>
);

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const pairs       = useScannerStore(s => s.pairs);
  const isLoading   = useScannerStore(s => s.isLoading);
  const fetchRates  = useScannerStore(s => s.fetchRates);

  // Pull live data so the hero proves this is a real, running product.
  useEffect(() => { if (pairs.length === 0) fetchRates(); }, [pairs.length, fetchRates]);

  const { topAnnual, topRate, teaser } = useMemo(() => {
    const byRate = [...pairs].sort((a, b) => b.currentRate - a.currentRate);
    return {
      topAnnual: pairs.reduce((m, p) => Math.max(m, p.annualYield), 0),
      topRate:   byRate[0]?.currentRate ?? 0,
      teaser:    byRate.slice(0, 5),
    };
  }, [pairs]);

  const loading = isLoading && pairs.length === 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--grad-ambient)', color: 'var(--w-050)' }}>
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '56px 24px 40px' : '104px 24px 72px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28,
          padding: '5px 12px', borderRadius: 999, border: '1px solid var(--c-700)', background: 'var(--c-900)',
          fontSize: 12, color: 'var(--w-200)',
        }}>
          <span className="live-dot" /> Live on Hyperliquid · funding paid hourly
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em',
          fontSize: isMobile ? 40 : 66, lineHeight: 1.02, color: 'var(--w-000)', marginBottom: 20,
        }}>
          Harvest funding.<br />Stay delta&#8209;neutral.
        </h1>

        <p style={{ maxWidth: 560, margin: '0 auto 32px', fontSize: isMobile ? 15 : 17, lineHeight: 1.6, color: 'var(--w-200)' }}>
          Osprey scans every Hyperliquid perpetual for funding-rate yield, then holds a
          long-spot / short-perp position so you collect the rate without taking price risk.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
          <Link to="/app" className="btn btn-primary btn-lg">Launch App <ArrowRight size={17} /></Link>
          <Link to="/app" className="btn btn-secondary btn-lg">View live rates</Link>
        </div>

        {/* Live stat strip */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', maxWidth: 620, margin: '0 auto' }}>
          <HeroStat label="Pairs tracked" value={pairs.length} loading={loading} />
          <HeroStat label="Top annual funding" value={`${(topAnnual * 100).toFixed(0)}%`} loading={loading} />
          <HeroStat label="Hottest 1h rate" value={`${(topRate * 100).toFixed(4)}%`} loading={loading} />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px' }}>
        <SectionTitle kicker="How it works" title="Three steps to yield" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 16, marginTop: 32 }}>
          {[
            { n: 1, icon: Search, t: 'Scan', d: 'Every perp ranked by funding rate, annualized yield, and fee-aware Net APY — updated every hour.' },
            { n: 2, icon: Zap,    t: 'Arm the engine', d: 'Set your thresholds. Osprey opens a long-spot / short-perp pair when a rate clears your bar.' },
            { n: 3, icon: Wallet, t: 'Harvest', d: 'Collect funding each hour while your delta stays flat. Track every payment in your portfolio.' },
          ].map(s => (
            <div key={s.n} className="glass-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30,
                  borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14,
                }}>{s.n}</span>
                <s.icon size={18} color="var(--w-200)" />
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--w-000)', marginBottom: 8 }}>{s.t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--w-200)' }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live rates teaser ────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <SectionTitle kicker="Live right now" title="Top funding rates" />
          <Link to="/app" className="btn btn-ghost btn-sm">See all {pairs.length || ''} pairs <ArrowRight size={14} /></Link>
        </div>
        <div className="hero-card glass-card" style={{ marginTop: 24, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto auto' : '1.4fr 1fr 1fr 1fr 80px', columnGap: 16, padding: '12px 20px', borderBottom: '1px solid var(--c-700)', fontSize: 10, fontWeight: 600, color: 'var(--w-300)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <span>Pair</span>
            {!isMobile && <span>Price</span>}
            <span style={{ textAlign: 'right' }}>Rate 1h</span>
            <span style={{ textAlign: 'right' }}>Annual</span>
            {!isMobile && <span style={{ textAlign: 'right' }}>7d</span>}
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: i < 4 ? '1px solid var(--c-800)' : 'none' }}>
                <span className="skeleton" style={{ display: 'block', height: 14, width: '40%' }} />
              </div>
            ))
          ) : teaser.map((p, i) => (
            <button key={p.symbol} onClick={() => navigate(`/app/pair/${p.symbol}`)}
              style={{
                display: 'grid', gridTemplateColumns: isMobile ? '1fr auto auto' : '1.4fr 1fr 1fr 1fr 80px', columnGap: 16,
                alignItems: 'center', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '13px 20px', border: 'none', background: 'transparent',
                borderBottom: i < teaser.length - 1 ? '1px solid var(--c-800)' : 'none',
                transition: 'background var(--t-fast)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-850)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--w-000)' }}>{p.symbol}</span>
              {!isMobile && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--w-200)' }}>{formatUSD(p.price)}</span>}
              <span style={{ textAlign: 'right' }}><span className={`rate-badge ${p.heat}`}>{(p.currentRate * 100).toFixed(4)}%</span></span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--pos)' }}>{(p.annualYield * 100).toFixed(0)}%</span>
              {!isMobile && <span style={{ display: 'flex', justifyContent: 'flex-end' }}>{p.sparkline7d.length >= 2 ? <Sparkline data={p.sparkline7d} width={56} height={20} /> : <span style={{ color: 'var(--w-400)' }}>—</span>}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* ── Why it's credible ────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px 8px' }}>
        <SectionTitle kicker="Why it's safe money" title="Delta-neutral by design" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 16, marginTop: 32 }}>
          {[
            { icon: Scale, t: 'Market-neutral', d: 'Long spot, short the perp in equal size. Price can go anywhere — your P&L comes from funding, not direction.' },
            { icon: ShieldCheck, t: 'Non-custodial', d: 'Your keys, your Hyperliquid account. Osprey signs through your wallet and never holds your funds.' },
            { icon: Zap, t: 'Fee-aware', d: 'Every yield figure is net of maker/taker and spot fees, so Net APY is the number you actually keep.' },
          ].map(c => (
            <div key={c.t} style={{ padding: '4px 4px' }}>
              <c.icon size={22} color="var(--accent)" style={{ marginBottom: 14 }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--w-000)', marginBottom: 8 }}>{c.t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--w-200)' }}>{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px' }}>
        <div className="hero-card" style={{ borderRadius: 'var(--r-xl)', background: 'var(--grad-ambient)', border: '1px solid var(--c-700)', padding: isMobile ? '40px 24px' : '56px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em', fontSize: isMobile ? 28 : 38, color: 'var(--w-000)', marginBottom: 14 }}>
            Start harvesting in minutes
          </h2>
          <p style={{ maxWidth: 440, margin: '0 auto 28px', fontSize: 15, color: 'var(--w-200)', lineHeight: 1.6 }}>
            Connect your Hyperliquid wallet, set a threshold, and let the rates come to you.
          </p>
          <Link to="/app" className="btn btn-primary btn-lg">Launch App <ArrowRight size={17} /></Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--c-800)', marginTop: 24 }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <Bird size={18} color="var(--accent)" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--w-050)' }}>OSPREY</span>
          </Link>
          <nav style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginLeft: isMobile ? 0 : 'auto', fontSize: 13 }}>
            <Link to="/app" style={{ color: 'var(--w-200)', textDecoration: 'none' }}>Scanner</Link>
            <Link to="/docs" style={{ color: 'var(--w-200)', textDecoration: 'none' }}>Docs & API</Link>
            <a href="https://github.com/Xtley001/osprey" {...EXT} style={{ color: 'var(--w-200)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Github size={14} /> GitHub</a>
            <a href="https://app.hyperliquid.xyz" {...EXT} style={{ color: 'var(--w-200)', textDecoration: 'none' }}>Hyperliquid ↗</a>
          </nav>
        </div>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 32px', fontSize: 11, color: 'var(--w-400)', lineHeight: 1.6 }}>
          Osprey is a non-custodial interface for funding-rate strategies on Hyperliquid perpetuals. Not financial advice.
          Funding rates fluctuate and can turn negative; delta-neutral positions still carry execution, liquidation, and smart-contract risk.
        </div>
      </footer>
    </div>
  );
};

const SectionTitle: React.FC<{ kicker: string; title: string }> = ({ kicker, title }) => (
  <div>
    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>{kicker}</p>
    <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em', fontSize: 30, color: 'var(--w-000)' }}>{title}</h2>
  </div>
);

export default Landing;
