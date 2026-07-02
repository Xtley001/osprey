import { useFeeStore } from '../../store/feeStore';
import React, { useState } from 'react';
import { X, Zap, AlertTriangle, Loader } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { usePositionStore } from '../../store/positionStore';
import { toast } from './Toast';
import { formatUSD, formatRateRaw } from '../../utils/format';
import { placeMarketOrder } from '../../api/hyperliquid';
import { buildSigner } from '../../api/signing';
import { getActiveSigner } from '../../hooks/useWallet';
import type { FundingRate } from '../../types/funding';

interface EntryModalProps {
  pair: FundingRate;
  onClose: () => void;
}

export const EntryModal: React.FC<EntryModalProps> = ({ pair, onClose }) => {
  const wallet     = useAppStore(s => s.wallet);
  const openPos    = usePositionStore(s => s.openPosition);
  const fees       = useFeeStore(s => s.fees);

  const maxCapital = wallet.balance;

  const [sizePct,    setSizePct]    = useState(50);
  const [confirmed,  setConfirmed]  = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const capital    = Math.max(1, Math.floor((maxCapital * sizePct) / 100));
  const notional   = capital / 2; // each leg (perp notional = capital/2)

  // CALC_AUDIT.md §2.1 — entry fees: maker on both legs
  const perpEntryFee   = notional * fees.perpMaker;
  const spotEntryFee   = notional * fees.spotMaker;
  const entryFee       = perpEntryFee + spotEntryFee;

  // CALC_AUDIT.md §2.2 — exit fees: taker on both legs (for break-even calculation)
  const totalRoundTripFees = entryFee + notional * (fees.perpTaker + fees.spotTaker);
  void totalRoundTripFees; // documented for reference; break-even uses entryFee only for display

  // CALC_AUDIT.md §1.1 — hourly income on perp notional only
  const hourlyIncome  = notional * pair.currentRate;
  const breakEvenHrs  = entryFee / Math.max(hourlyIncome, 0.000001);
  const dailyIncome   = hourlyIncome * 24;

  const insufficientBalance = wallet.balance < capital || wallet.balance === 0;
  const canSubmit = confirmed && wallet.connected && !insufficientBalance && !submitting;

  const handleEnter = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const eth = (window as Window & { ethereum?: unknown }).ethereum;
      const getSignerFn = getActiveSigner();
      if (!eth && !getSignerFn) { toast.error('No wallet signer available — connect browser wallet or load Agent Key'); setSubmitting(false); return; }

      toast.info(`Submitting order to Hyperliquid…`);

      // Phase 1.3: build signer from registry or browser provider
      let signer: import('ethers').Signer;
      try {
        signer = getSignerFn
          ? await getSignerFn()
          : await buildSigner({ mode: 'browser', provider: eth! });
      } catch (sigErr) {
        toast.error(`Failed to build signer: ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
        setSubmitting(false);
        return;
      }

      const coinSz  = parseFloat((notional / pair.price).toFixed(4));
      const worstPx = pair.price * 0.9995;

      let result = await placeMarketOrder({
        coin: pair.symbol, isBuy: false,
        sz: coinSz, px: worstPx,
        address: wallet.address!,
        signer,
        tif: 'Alo',
      });

      if (!result.success && result.error?.includes('Would immediately cross')) {
        result = await placeMarketOrder({
          coin: pair.symbol, isBuy: false,
          sz: coinSz, px: pair.price * 0.99,
          address: wallet.address!,
          signer,
          tif: 'Ioc',
        });
      }

      if (!result.success) {
        toast.error(`Order failed: ${result.error}`);
        setSubmitting(false);
        return;
      }
      toast.success(`Order placed · ID: ${result.orderId ?? 'confirmed'}`);

      // Track position in store
      openPos({
        symbol:        pair.symbol,
        entryTime:     Date.now(),
        entryPrice:    pair.price,
        entryRate:     pair.currentRate,
        notional,
        fundingEarned: 0,
        feesPaid:      entryFee,
        currentPrice:  pair.price,
        currentRate:   pair.currentRate,
        hedgeDrift:    0,
        hoursHeld:     0,
      });

      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(10,11,15,0.85)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 440, padding: 'var(--sp-5)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{pair.symbol}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Short Perp + Long Spot · Live Order
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`rate-badge ${pair.heat}`}>{formatRateRaw(pair.currentRate)}/hr</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
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
            style={{ width: '100%', accentColor: 'var(--accent-yellow)', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            {[25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => setSizePct(pct)} style={{
                flex: 1, padding: '3px 0', borderRadius: 'var(--r-sm)',
                border: `1px solid ${sizePct === pct ? 'var(--accent-yellow)' : 'var(--glass-border)'}`,
                background: sizePct === pct ? 'rgba(245,197,66,0.1)' : 'transparent',
                color: sizePct === pct ? 'var(--accent-yellow)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
              }}>{pct}%</button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          {[
            { label: 'Strategy',       value: 'Short Perp + Long Spot' },
            { label: 'Each leg',       value: formatUSD(notional) },
            { label: 'Entry fees',     value: `−${formatUSD(entryFee)}` },
            { label: 'Est. per hour',  value: `+${formatUSD(hourlyIncome)}` },
            { label: 'Est. per day',   value: `+${formatUSD(dailyIncome)}` },
            { label: 'Break-even',     value: `${breakEvenHrs.toFixed(1)}h` },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Warnings */}
        {insufficientBalance && (
          <div style={{ background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', fontSize: 12, color: 'var(--accent-red)', display: 'flex', gap: 8 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            {wallet.balance === 0
              ? 'No Hyperliquid balance. Deposit USDC at app.hyperliquid.xyz first.'
              : `Insufficient balance. You have ${formatUSD(wallet.balance)} but need ${formatUSD(capital)}.`}
          </div>
        )}

        {!wallet.connected && (
          <div style={{ background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', fontSize: 12, color: 'var(--accent-red)' }}>
            <AlertTriangle size={13} style={{ display: 'inline', marginRight: 5 }} />
            Wallet not connected. Go to Settings → Connect Wallet.
          </div>
        )}

        {/* Confirmation checkbox */}
        {wallet.connected && !insufficientBalance && (
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
            background: canSubmit ? 'var(--accent-yellow)' : 'var(--bg-elevated)',
            color: canSubmit ? '#0a0b0f' : 'var(--text-muted)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all var(--t-fast)',
          }}
        >
          {submitting ? <Loader size={15} className="spin" /> : <Zap size={15} />}
          {submitting ? 'Submitting order…' : `Place Real Order · ${formatUSD(capital)}`}
        </button>
      </div>
    </div>
  );
};
