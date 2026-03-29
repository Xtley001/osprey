import { DEFAULT_STRATEGY } from '../utils/constants';
import { useBreakpoint } from '../hooks/useBreakpoint';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Zap, BarChart2 } from 'lucide-react';
import { useScannerStore } from '../store/scannerStore';
import { useAppStore } from '../store/appStore';
import { fetchFundingHistory, fetchCandles } from '../api/hyperliquid';
import { computeSignal } from '../engine/signals';
import { formatPrice, formatPct, formatUSD, formatRateRaw } from '../utils/format';
import type { FundingEvent, Candle } from '../types/funding';
import { EntryModal } from '../components/shared/EntryModal';

const SignalBadge: React.FC<{ label: string; reason: string }> = ({ label, reason }) => {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    ENTER: { bg: 'rgba(0,212,160,0.12)', color: 'var(--accent-green)', border: 'rgba(0,212,160,0.3)' },
    WAIT:  { bg: 'rgba(245,197,66,0.1)', color: 'var(--accent-yellow)', border: 'rgba(245,197,66,0.25)' },
    EXIT:  { bg: 'rgba(255,79,110,0.12)', color: 'var(--accent-red)', border: 'rgba(255,79,110,0.3)' },
    AVOID: { bg: 'rgba(68,71,90,0.3)', color: 'var(--text-muted)', border: 'var(--glass-border)' },
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

    const W = canvas.offsetWidth; const H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const rates = history.map(e => e.rate);
    const maxRate = Math.max(...rates) * 1.1 || 0.001;
    const barW = (W - 20) / history.length;

    const getColor = (r: number) => {
      if (r < 0.0002) return '#5b8dee';
      if (r < 0.0005) return '#f5c542';
      if (r < 0.001)  return '#ff8c42';
      return '#ff4f6e';
    };

    history.forEach((ev, i) => {
      const barH = (ev.rate / maxRate) * (H - 20);
      const x = 10 + i * barW;
      const y = H - barH - 5;
      ctx.fillStyle = getColor(ev.rate);
      ctx.fillRect(x, y, barW - 1, barH);
    });

    // Threshold line
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

const PairDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const pair = useScannerStore(s => s.pairs.find(p => p.symbol === symbol));
  const mode = useAppStore(s => s.mode);
  const [showEntry, setShowEntry] = useState(false);
  const { isMobile } = useBreakpoint();

  const [history, setHistory] = useState<FundingEvent[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    Promise.all([fetchFundingHistory(symbol), fetchCandles(symbol)]).then(([h, c]) => {
      setHistory(h); setCandles(c); setLoading(false);
    });
  }, [symbol]);

  if (!symbol) return null;

  const currentRate = pair?.currentRate ?? 0;
  const avg24h = history.slice(-24).reduce((s, e) => s + e.rate, 0) / Math.max(history.slice(-24).length, 1);
  const avg7d  = history.reduce((s, e) => s + e.rate, 0) / Math.max(history.length, 1);
  const signal = computeSignal(currentRate, history, DEFAULT_STRATEGY.entryRateThreshold, DEFAULT_STRATEGY.exitRateThreshold);



  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)', maxWidth: 1000, margin: '0 auto' }}>
      <button className="btn btn-ghost" style={{ marginBottom: 'var(--sp-4)', padding: '5px 12px', fontSize: 12 }} onClick={() => navigate('/')}>
        <ArrowLeft size={14} /> Back to Scanner
      </button>

      {/* Header */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24 }}>{symbol}</h1>
            <span style={{ background: 'rgba(155,109,255,0.15)', color: 'var(--accent-purple)', border: '1px solid rgba(155,109,255,0.25)', borderRadius: 'var(--r-sm)', padding: '2px 8px', fontSize: 11 }}>
              {pair?.category ?? 'Crypto'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)' }}>
            {pair && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }}>{formatPrice(pair.price)}</p>
                  <p style={{ fontSize: 12, color: pair.change24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>{formatPct(pair.change24h)} 24h</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current Rate</p>
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

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600 }}>
            <Activity size={12} style={{ display: 'inline', marginRight: 4 }} />
            Funding History (72h)
          </p>
          {loading ? (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
          ) : (
            <FundingChart history={history} />
          )}
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Dashed line = entry threshold. Bar color = heat level.</p>
        </div>

        <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', fontWeight: 600 }}>
            <BarChart2 size={12} style={{ display: 'inline', marginRight: 4 }} />
            Price (1h candles, last 72h)
          </p>
          {loading ? (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
          ) : candles.length > 0 ? (
            <SimplePriceChart candles={candles.slice(-48)} />
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No data</div>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid-3" style={{ marginBottom: 'var(--sp-4)' }}>
        {[
          { label: 'Avg Rate 24h', value: formatRateRaw(avg24h) + '/hr', mono: true },
          { label: 'Avg Rate 7d',  value: formatRateRaw(avg7d) + '/hr',  mono: true },
          { label: 'Annualized',   value: `${(currentRate * 8760 * 100).toFixed(1)}%`, mono: true, green: true },
          { label: 'Open Interest', value: formatUSD(pair?.openInterest ?? 0), mono: true },
          { label: '24h Volume',   value: formatUSD(pair?.volume24h ?? 0), mono: true },
          { label: 'Signal Conf.', value: `${signal.confidence}%`, mono: true },
        ].map(stat => (
          <div key={stat.label} className="stat-card">
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{stat.label}</p>
            <p style={{ fontFamily: stat.mono ? 'var(--font-mono)' : 'var(--font-display)', fontSize: 15, fontWeight: 600, color: stat.green ? 'var(--accent-green)' : 'var(--text-primary)' }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {showEntry && pair && <EntryModal pair={pair} onClose={() => setShowEntry(false)} />}
        <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 14 }} onClick={() => setShowEntry(true)}>
          <Zap size={15} /> Enter Position
        </button>
        <button className="btn btn-ghost" style={{ padding: '10px 18px', fontSize: 13 }} onClick={() => navigate(`/backtest?symbol=${symbol}`)}>
          <BarChart2 size={15} /> Open in Backtester
        </button>
      </div>
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
    const W = canvas.offsetWidth; const H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    const prices = candles.map(c => c.close);
    const min = Math.min(...prices) * 0.999;
    const max = Math.max(...prices) * 1.001;
    const range = max - min || 1;
    const step = W / (prices.length - 1);
    ctx.strokeStyle = 'var(--hl-teal)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    prices.forEach((p, i) => {
      const x = i * step;
      const y = H - ((p - min) / range) * (H - 10) - 5;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [candles]);
  return <canvas ref={canvasRef} style={{ width: '100%', height: 140, display: 'block' }} />;
};

export default PairDetail;
