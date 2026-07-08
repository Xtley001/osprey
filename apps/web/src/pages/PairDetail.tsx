import {
  DEFAULT_STRATEGY,
  computeBreakEvenHours,
  fetchFundingHistory,
  fetchCandles,
  computeSignal,
  formatPrice,
  formatPct,
  formatUSD,
  formatRateRaw,
  type FundingEvent,
  type Candle,
} from '@osprey/engine';
import { useFeeStore } from '../store/feeStore';
import { useBreakpoint } from '../hooks/useBreakpoint';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Zap, BarChart2 } from 'lucide-react';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { usePositionStore } from '../store/positionStore';
import { EntryModal } from '../components/shared/EntryModal';
import { Stat, Badge, Skeleton } from '../components/ui';

const SignalBadge: React.FC<{ label: string; reason: string }> = ({ label, reason }) => {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    ENTER: { bg: 'rgba(47,215,155,0.12)', color: 'var(--pos)', border: 'rgba(47,215,155,0.3)' },
    WAIT:  { bg: 'rgba(245,197,66,0.1)', color: 'var(--warn)', border: 'rgba(245,197,66,0.25)' },
    EXIT:  { bg: 'rgba(255,90,114,0.12)', color: 'var(--neg)', border: 'rgba(255,90,114,0.3)' },
    AVOID: { bg: 'var(--c-800)', color: 'var(--w-300)', border: 'var(--c-700)' },
  };
  const c = colors[label] ?? colors.AVOID;
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: c.color }}>{label === 'ENTER' ? '✅' : label === 'EXIT' ? '⚠️' : label === 'WAIT' ? '⏳' : '🚫'} {label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{reason}</span>
    </div>
  );
};

const FundingChart: React.FC<{ history: FundingEvent[] }> = ({ history }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth; const H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const rates = history.map(e => e.rate);
    const maxRate = Math.max(...rates) * 1.1 || 0.001;
    const barW = (W - 20) / history.length;

    const getColor = (r: number) => {
      if (r < 0.0002) return '#5b8dee';
      if (r < 0.0005) return '#f5c542';
      if (r < 0.001)  return '#ff8c42';
      return '#FF5A72';
    };

    history.forEach((ev, i) => {
      const barH = (ev.rate / maxRate) * (H - 20);
      const x = 10 + i * barW;
      const y = H - barH - 5;
      ctx.fillStyle = getColor(ev.rate);
      ctx.fillRect(x, y, barW - 1, barH);
    });

    const threshold = DEFAULT_STRATEGY.entryRateThreshold;
    const lineY = H - (threshold / maxRate) * (H - 20) - 5;
    ctx.strokeStyle = 'rgba(67,232,216,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(W, lineY); ctx.stroke();
  }, [history]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 140, display: 'block' }} />
    </div>
  );
};

const SimplePriceChart: React.FC<{ candles: Candle[] }> = ({ candles }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth; const H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const prices = candles.map(c => c.close);
    const min = Math.min(...prices) * 0.999;
    const max = Math.max(...prices) * 1.001;
    const range = max - min || 1;
    const step = W / (prices.length - 1);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#43E8D8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    prices.forEach((p, i) => {
      const x = i * step;
      const y = H - ((p - min) / range) * (H - 10) - 5;
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
  }, [candles]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 140, display: 'block' }} />;
};

const PairDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate   = useNavigate();
  const pair       = useScannerStore(s => s.pairs.find(p => p.symbol === symbol));
  const wallet     = useAppStore(s => s.wallet);
  const trades     = usePositionStore(s => s.trades);
  const pairTrades = useMemo(() => trades.filter(t => t.symbol === symbol), [trades, symbol]);
  const liveFees   = useFeeStore(s => s.fees);
  const [showEntry, setShowEntry] = useState(false);
  const { isMobile } = useBreakpoint();

  // Audit P0-3: cached via TanStack Query so navigating back to a pair is
  // instant (served from cache) instead of flashing "Loading…" on every mount.
  const detailQuery = useQuery({
    queryKey: ['pair-detail', symbol],
    enabled:  !!symbol,
    staleTime: 60_000,        // funding history + candles are hourly — 60s is plenty
    queryFn: async () => {
      const [h, c] = await Promise.all([
        fetchFundingHistory(symbol!),
        fetchCandles(symbol!),
      ]);
      return { history: h, candles: c };
    },
  });

  const history   = detailQuery.data?.history ?? [];
  const candles   = detailQuery.data?.candles ?? [];
  // Only show the loading state on the very first fetch (no cached data yet).
  const loading   = detailQuery.isLoading;
  const dataError = detailQuery.error
    ? (detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error))
    : null;

  const currentRate  = pair?.currentRate ?? 0;
  const sparkline7d  = pair?.sparkline7d ?? [];

  const avg24h       = history.slice(-24).reduce((s, e) => s + e.rate, 0) / Math.max(history.slice(-24).length, 1);
  const avg7d        = history.reduce((s, e) => s + e.rate, 0) / Math.max(history.length, 1);
  const signal       = computeSignal(currentRate, history, DEFAULT_STRATEGY.entryRateThreshold, DEFAULT_STRATEGY.exitRateThreshold);
  const breakEvenHrs = currentRate > 0 ? computeBreakEvenHours(currentRate, liveFees) : null;

  // Rate percentile from live 7d sparkline — CALC_AUDIT.md §3.3
  const pctile = useMemo(() => {
    if (sparkline7d.length < 10) return null;
    const sorted = [...sparkline7d].sort((a, b) => a - b);
    const pos = sorted.findIndex(r => r >= currentRate);
    return Math.round((pos / sorted.length) * 100);
  }, [sparkline7d, currentRate]);

  // Average hold time from live trade history
  const avgHoldHours = pairTrades.length > 0
    ? pairTrades.reduce((s, t) => s + t.hoursHeld, 0) / pairTrades.length
    : null;

  return !symbol ? null : (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)', maxWidth: 1000, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--sp-4)' }} onClick={() => navigate('/app')}>
        <ArrowLeft size={14} /> Back to Scanner
      </button>

      {/* Header — ambient hero */}
      <div className="glass-card hero-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)', background: 'var(--grad-ambient)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--w-000)', letterSpacing: '-0.02em' }}>{symbol}</h1>
            <Badge tone={pair?.category === 'TradFi' ? 'purple' : 'blue'}>{pair?.category ?? 'Crypto'}</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)' }}>
            {pair && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--w-000)' }}>{formatPrice(pair.price)}</p>
                  <p style={{ fontSize: 12, color: pair.change24h >= 0 ? 'var(--pos)' : 'var(--neg)', fontFamily: 'var(--font-mono)' }}>{pair.change24h >= 0 ? '+' : ''}{formatPct(pair.change24h)} 24h</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="label" style={{ marginBottom: 4 }}>Current Rate</p>
                  <span className={`rate-badge ${pair.heat}`} style={{ fontSize: 14 }}>{formatRateRaw(pair.currentRate)}/hr</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Signal */}
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <SignalBadge label={signal.label} reason={signal.reason} />
      </div>

      {/* Intelligence stats (Phase 2/3) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
        <Stat
          label="7d Rate Percentile" size={20}
          value={pctile !== null ? `${pctile}th` : '—'}
          color={pctile === null ? 'var(--w-300)' : pctile >= 75 ? 'var(--pos)' : pctile >= 40 ? 'var(--warn)' : 'var(--w-300)'}
          sub={pctile !== null ? (pctile >= 75 ? 'High vs recent history' : pctile >= 40 ? 'Average vs recent history' : 'Low vs recent history') : undefined}
        />
        <Stat
          label="Hours Above Threshold" size={20}
          value={`${pair?.persistenceHours ?? 0}h`}
          color={(pair?.persistenceHours ?? 0) >= 24 ? 'var(--pos)' : (pair?.persistenceHours ?? 0) >= 6 ? 'var(--warn)' : 'var(--w-300)'}
          sub="persistence"
        />
        <Stat
          label="Avg Hold (Your Trades)" size={20}
          value={avgHoldHours !== null ? `${avgHoldHours.toFixed(0)}h` : 'No history'}
          color={avgHoldHours !== null ? 'var(--w-000)' : 'var(--w-300)'}
          sub={avgHoldHours !== null ? `${pairTrades.length} trade${pairTrades.length !== 1 ? 's' : ''}` : undefined}
        />
        <Stat
          label="Break-even Hours" size={20}
          value={breakEvenHrs !== null ? `${breakEvenHrs.toFixed(1)}h` : '—'}
          color={breakEvenHrs === null ? 'var(--w-300)' : breakEvenHrs <= 24 ? 'var(--pos)' : 'var(--warn)'}
          sub={breakEvenHrs !== null ? 'to cover round-trip fees' : undefined}
        />
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600 }}>
            <Activity size={12} style={{ display: 'inline', marginRight: 4 }} />
            Funding History (72h)
          </p>
          {loading ? (
            <Skeleton height={140} radius="var(--r-md)" />
          ) : dataError ? (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: 'var(--neg)', fontSize: 12, fontWeight: 600 }}>⚠ API Error</span>
              <span style={{ color: 'var(--w-300)', fontSize: 11, textAlign: 'center', maxWidth: 220 }}>{dataError}</span>
            </div>
          ) : (
            <FundingChart history={history} />
          )}
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Dashed line = entry threshold.</p>
        </div>

        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600 }}>
            <BarChart2 size={12} style={{ display: 'inline', marginRight: 4 }} />
            Price (1h candles, last 72h)
          </p>
          {loading ? (
            <Skeleton height={140} radius="var(--r-md)" />
          ) : candles.length > 0 ? (
            <SimplePriceChart candles={candles.slice(-48)} />
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w-300)', fontSize: 12 }}>No data</div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid-3" style={{ marginBottom: 'var(--sp-4)' }}>
        <Stat label="Avg Rate 24h"  value={formatRateRaw(avg24h) + '/hr'} />
        <Stat label="Avg Rate 7d"   value={formatRateRaw(avg7d) + '/hr'} />
        <Stat label="Annualized"    value={`${(currentRate * 8760 * 100).toFixed(1)}%`} color="var(--pos)" />
        <Stat label="Open Interest" value={formatUSD(pair?.openInterest ?? 0)} />
        <Stat label="24h Volume"    value={formatUSD(pair?.volume24h ?? 0)} />
        <Stat label="Signal Conf."  value={`${signal.confidence}%`} />
      </div>

      {/* Entry CTA — primary, full width, bottom (Phase 2/3) */}
      <div style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--c-700)' }}>
        {showEntry && pair && <EntryModal pair={pair} onClose={() => setShowEntry(false)} />}
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          onClick={() => setShowEntry(true)}
          disabled={!wallet.connected}
        >
          <Zap size={16} />
          {wallet.connected
            ? `Enter Position — ${(currentRate * 100).toFixed(4)}%/hr`
            : 'Connect Wallet to Enter'
          }
        </button>
        {!wallet.connected && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--w-300)', marginTop: 8 }}>
            Agent Key required for automated entry. Configure in Settings.
          </p>
        )}
      </div>
    </div>
  );
};

export default PairDetail;
