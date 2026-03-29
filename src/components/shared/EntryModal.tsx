import React, { useState } from 'react';
import { X, Zap, AlertTriangle, Loader } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { usePositionStore } from '../../store/positionStore';
import { toast } from './Toast';
import { formatUSD, formatRateRaw } from '../../utils/format';
import { placeMarketOrder } from '../../api/hyperliquid';
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

  const isReal     = mode === 'real';
  const maxCapital = isReal ? wallet.balance : demo.balance;

  const [sizePct,    setSizePct]    = useState(50);
  const [confirmed,  setConfirmed]  = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const capital       = Math.max(1, Math.floor((maxCapital * sizePct) / 100));
  const notional      = capital / 2; // each leg
  const entryFee      = notional * 0.00035 * 2;
  const hourlyIncome  = notional * pair.currentRate;
  const breakEvenHrs  = entryFee / Math.max(hourlyIncome, 0.000001);
  const dailyIncome   = hourlyIncome * 24;

  // Warn if balance is insufficient
  const insufficientBalance = isReal && (wallet.balance < capital || wallet.balance === 0);
  const canSubmit = isReal
    ? confirmed && wallet.connected && !insufficientBalance && !submitting
    : !submitting;

  const handleEnter = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      if (isReal) {
        // Submit actual order to Hyperliquid
        const eth = (window as Window & { ethereum?: unknown }).ethereum;
        if (!eth) { toast.error('MetaMask not found'); setSubmitting(false); return; }

        toast.info(`Submitting order to Hyperliquid…`);

        // Short perp: sell (not buy), size = notional / current price
        const coinSz = parseFloat((notional / pair.price).toFixed(4));
        const worstPx = pair.price * 0.99; // 1% slippage guard

        const result = await placeMarketOrder({
          coin: pair.symbol,
          isBuy: false,         // short = sell
          sz: coinSz,
          px: worstPx,
          address: wallet.address!,
          provider: eth,
        });

        if (!result.success) {
          toast.error(`Order failed: ${result.error}`);
          setSubmitting(false);
          return;
        }
        toast.success(`Order placed · ID: ${result.orderId ?? 'confirmed'}`);
      }

      // Track position in store (both demo and real)
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

      if (!isReal) {
        toast.success(`${pair.symbol} demo position opened · ${formatUSD(notional)} notional`);
      }
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-overlay)',
          border: `1px solid ${isReal ? 'rgba(245,197,66,0.35)' : 'var(--glass-border-hl)'}`,
          borderRadius: 'var(--r-xl)', padding: 'var(--sp-6)',
          width: 420, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 8px 48px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 5 }}>
              {isReal ? 'Place Real Order' : 'Open Demo Position'} — {pair.symbol}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`rate-badge ${pair.heat}`}>{formatRateRaw(pair.currentRate)}/hr</span>
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 'var(--r-sm)', fontWeight: 700,
                background: isReal ? 'rgba(245,197,66,0.15)' : 'rgba(91,141,238,0.12)',
                color: isReal ? 'var(--accent-yellow)' : 'var(--accent-blue)',
                border: `1px solid ${isReal ? 'rgba(245,197,66,0.3)' : 'rgba(91,141,238,0.25)'}`,
              }}>
                {isReal ? '⚡ LIVE' : '◉ DEMO'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        {/* Balance display */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isReal ? 'HL Balance' : 'Demo Balance'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)' }}>
            {formatUSD(maxCapital)}
          </span>
        </div>

        {/* Size slider */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Position Size</label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 15 }}>{formatUSD(capital)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sizePct}%</span>
            </div>
          </div>
          <input
            type="range" min={5} max={100} step={5} value={sizePct}
            onChange={e => setSizePct(Number(e.target.value))}
            style={{ width: '100%', accentColor: isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            {[25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => setSizePct(pct)} style={{
                flex: 1, padding: '3px 0', borderRadius: 'var(--r-sm)',
                border: `1px solid ${sizePct === pct ? (isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)') : 'var(--glass-border)'}`,
                background: sizePct === pct ? (isReal ? 'rgba(245,197,66,0.1)' : 'var(--hl-teal-dim)') : 'transparent',
                color: sizePct === pct ? (isReal ? 'var(--accent-yellow)' : 'var(--hl-teal)') : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
              }}>{pct}%</button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          {[
            { label: 'Strategy',        value: 'Short Perp + Long Spot' },
            { label: 'Each leg',        value: formatUSD(notional) },
            { label: 'Entry fees',      value: `−${formatUSD(entryFee)}` },
            { label: 'Est. per hour',   value: `+${formatUSD(hourlyIncome)}` },
            { label: 'Est. per day',    value: `+${formatUSD(dailyIncome)}` },
            { label: 'Break-even',      value: `${breakEvenHrs.toFixed(1)}h` },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Warnings */}
        {isReal && insufficientBalance && (
          <div style={{ background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', fontSize: 12, color: 'var(--accent-red)', display: 'flex', gap: 8 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            {wallet.balance === 0
              ? 'No Hyperliquid balance. Deposit USDC at app.hyperliquid.xyz first.'
              : `Insufficient balance. You have ${formatUSD(wallet.balance)} but need ${formatUSD(capital)}.`}
          </div>
        )}

        {isReal && !wallet.connected && (
          <div style={{ background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', fontSize: 12, color: 'var(--accent-red)' }}>
            <AlertTriangle size={13} style={{ display: 'inline', marginRight: 5 }} />
            Wallet not connected. Go to Settings → Connect MetaMask.
          </div>
        )}

        {/* Real mode confirmation */}
        {isReal && wallet.connected && !insufficientBalance && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12, marginBottom: 'var(--sp-4)' }}>
            <input
              type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--accent-yellow)', flexShrink: 0 }}
            />
            <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              I understand this is a <strong style={{ color: 'var(--accent-yellow)' }}>real order</strong> using live capital ({formatUSD(capital)}). This action cannot be undone.
            </span>
          </label>
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
          {submitting ? <Loader size={15} className="spin" /> : <Zap size={15} />}
          {submitting
            ? (isReal ? 'Submitting order…' : 'Opening…')
            : (isReal
                ? `Place Real Order · ${formatUSD(capital)}`
                : `Open Demo Position · ${formatUSD(capital)}`)}
        </button>
      </div>
    </div>
  );
};
