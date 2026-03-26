import React, { useState } from 'react';
import { X, Zap, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { usePositionStore } from '../../store/positionStore';
import { toast } from './Toast';
import { formatUSD, formatRateRaw } from '../../utils/format';
import type { FundingRate } from '../../types/funding';

interface EntryModalProps {
  pair: FundingRate;
  onClose: () => void;
}

export const EntryModal: React.FC<EntryModalProps> = ({ pair, onClose }) => {
  const mode       = useAppStore(s => s.mode);
  const demo       = useAppStore(s => s.demo);
  const wallet     = useAppStore(s => s.wallet);
  const openPos    = usePositionStore(s => s.openPosition);

  const maxCapital  = mode === 'demo' ? demo.balance : (wallet.balance || 10000);
  const [sizePct, setSizePct]       = useState(50);
  const [confirmed, setConfirmed]   = useState(false);

  const capital  = Math.floor((maxCapital * sizePct) / 100);
  const notional = capital / 2; // each leg
  const entryFee = notional * 0.00035 * 2;
  const hourlyIncome = notional * pair.currentRate;
  const breakEvenHrs = entryFee / Math.max(hourlyIncome, 0.000001);
  const dailyIncome  = hourlyIncome * 24;

  const isReal = mode === 'real';
  const canSubmit = isReal ? (confirmed && wallet.connected) : true;

  const handleEnter = () => {
    if (!canSubmit) return;
    openPos({
      symbol: pair.symbol,
      entryTime: Date.now(),
      entryPrice: pair.price,
      entryRate: pair.currentRate,
      notional,
      fundingEarned: 0,
      feesPaid: entryFee,
      currentPrice: pair.price,
      currentRate: pair.currentRate,
      hedgeDrift: 0,
      hoursHeld: 0,
      isDemo: !isReal,
    });
    toast.success(`${pair.symbol} position opened · ${formatUSD(notional)} notional`);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-overlay)',
          border: `1px solid ${isReal ? 'rgba(245,197,66,0.35)' : 'var(--glass-border-hl)'}`,
          borderRadius: 'var(--r-xl)', padding: 'var(--sp-6)',
          width: 400, maxWidth: '90vw',
          boxShadow: '0 8px 48px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
              Enter {pair.symbol}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`rate-badge ${pair.heat}`}>{formatRateRaw(pair.currentRate)}/hr</span>
              {isReal && (
                <span style={{ fontSize: 11, background: 'rgba(245,197,66,0.15)', color: 'var(--accent-yellow)', border: '1px solid rgba(245,197,66,0.3)', borderRadius: 'var(--r-sm)', padding: '1px 7px', fontWeight: 600 }}>
                  REAL ORDER
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        {/* Size slider */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Position Size</label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 15 }}>{formatUSD(capital)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({sizePct}% of {formatUSD(maxCapital)})</span>
            </div>
          </div>
          <input
            type="range" min={5} max={100} step={5} value={sizePct}
            onChange={e => setSizePct(Number(e.target.value))}
            style={{ width: '100%', accentColor: isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {[25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => setSizePct(pct)} style={{
                padding: '2px 10px', borderRadius: 'var(--r-sm)',
                border: `1px solid ${sizePct === pct ? (isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)') : 'var(--glass-border)'}`,
                background: sizePct === pct ? (isReal ? 'rgba(245,197,66,0.12)' : 'var(--hl-teal-dim)') : 'transparent',
                color: sizePct === pct ? (isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)') : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600,
              }}>{pct}%</button>
            ))}
          </div>
        </div>

        {/* Order summary */}
        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)',
          padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)',
        }}>
          {[
            { label: 'Strategy',       value: 'Short Perp + Long Spot (delta-neutral)' },
            { label: 'Each Leg',       value: formatUSD(notional) },
            { label: 'Entry Fees',     value: `−${formatUSD(entryFee)}` },
            { label: 'Est. Daily',     value: `+${formatUSD(dailyIncome)}` },
            { label: 'Break-even',     value: `${breakEvenHrs.toFixed(1)}h` },
            { label: 'Net Rate',       value: `${formatRateRaw(pair.currentRate)}/hr` },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Real mode warning + confirm */}
        {isReal && (
          <div style={{ marginBottom: 'var(--sp-4)' }}>
            {!wallet.connected && (
              <div style={{ background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', fontSize: 12, color: 'var(--accent-red)' }}>
                <AlertTriangle size={13} style={{ display: 'inline', marginRight: 5 }} />
                Wallet not connected. Go to Settings to connect MetaMask.
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--accent-yellow)', flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                I understand this is a <strong style={{ color: 'var(--accent-yellow)' }}>real order</strong> using live capital. I have reviewed the position size and fees.
              </span>
            </label>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleEnter}
          disabled={!canSubmit}
          style={{
            width: '100%', padding: '12px 0', border: 'none', borderRadius: 'var(--r-md)',
            background: canSubmit
              ? (isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)')
              : 'var(--bg-elevated)',
            color: canSubmit ? '#0a0b0f' : 'var(--text-muted)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all var(--t-fast)',
          }}
        >
          <Zap size={15} />
          {isReal ? `Place Real Order · ${formatUSD(capital)}` : `Open Demo Position · ${formatUSD(capital)}`}
        </button>
      </div>
    </div>
  );
};
