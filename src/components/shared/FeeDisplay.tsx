/**
 * FeeDisplay — live fee tier widget.
 *
 * Shows the user's current effective fee rates sourced from HL API.
 * Displayed in Settings and Harvest pages so users understand their
 * actual cost structure at all times.
 */
import React from 'react';
import { useFeeStore } from '../../store/feeStore';
import { useAppStore } from '../../store/appStore';
import { formatFeeRate, formatFeeSummary, computeBreakEvenHours } from '../../api/fees';

interface FeeDisplayProps {
  currentRate?: number;    // current funding rate for break-even calc
  compact?:     boolean;   // compact single-line display
}

export const FeeDisplay: React.FC<FeeDisplayProps> = ({ currentRate, compact }) => {
  const { fees, loading, error } = useFeeStore();
  const wallet  = useAppStore(s => s.wallet);
  const address = wallet.address;

  const breakEven = currentRate && currentRate > 0
    ? computeBreakEvenHours(currentRate, fees)
    : null;

  if (!address) {
    return (
      <div className="text-xs text-text-secondary">
        Connect wallet to see your live fee tier (using worst-case Tier 0 defaults).
      </div>
    );
  }

  if (loading) {
    return <div className="text-xs text-text-secondary animate-pulse">Fetching your fee tier from Hyperliquid…</div>;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-1.5 py-0.5 rounded font-mono ${
          fees.source === 'live' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {fees.perpTierLabel}
        </span>
        <span className="text-text-secondary">
          Perp {formatFeeRate(fees.perpTaker)}↓/{formatFeeRate(fees.perpMaker)}↑
        </span>
        <span className="text-text-secondary">·</span>
        <span className="text-text-secondary">
          Spot {formatFeeRate(fees.spotTaker)}↓/{formatFeeRate(fees.spotMaker)}↑
        </span>
        {fees.stakingDiscountPct > 0 && (
          <span className="text-purple-400">
            −{fees.stakingDiscountPct.toFixed(0)}% staking
          </span>
        )}
        {fees.source === 'fallback' && (
          <span className="text-yellow-400">⚠ fallback</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-text-primary">Your Fee Schedule</div>
        <div className="flex items-center gap-2">
          {fees.source === 'live' ? (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">✓ Live from HL</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">⚠ Fallback (Tier 0)</span>
          )}
          {fees.source === 'fallback' && address && (
            <button
              onClick={() => useFeeStore.getState().fetchFees(address)}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          Fee fetch error: {error}. Using conservative Tier 0 fallback.
        </div>
      )}

      {/* Fee grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Perp fees */}
        <div className="bg-surface-2 rounded-lg p-3">
          <div className="text-xs text-text-secondary mb-2">Perpetual ({fees.perpTierLabel})</div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Taker</span>
              <span className="font-mono text-red-400">{formatFeeRate(fees.perpTaker)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Maker</span>
              <span className={`font-mono ${fees.perpMaker < 0 ? 'text-green-400' : 'text-text-primary'}`}>
                {fees.perpMaker < 0 ? '-' : ''}{formatFeeRate(Math.abs(fees.perpMaker))}
                {fees.perpMaker < 0 && ' rebate'}
              </span>
            </div>
          </div>
        </div>

        {/* Spot fees */}
        <div className="bg-surface-2 rounded-lg p-3">
          <div className="text-xs text-text-secondary mb-2">Spot ({fees.spotTierLabel})</div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Taker</span>
              <span className="font-mono text-red-400">{formatFeeRate(fees.spotTaker)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Maker</span>
              <span className={`font-mono ${fees.spotMaker < 0 ? 'text-green-400' : 'text-text-primary'}`}>
                {fees.spotMaker < 0 ? '-' : ''}{formatFeeRate(Math.abs(fees.spotMaker))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Round-trip and break-even */}
      <div className="bg-surface-2 rounded-lg p-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Round-trip (entry + exit, both legs)</span>
          <span className="font-mono text-text-primary">{formatFeeRate(fees.roundTripRate)}</span>
        </div>
        {breakEven !== null && (
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">
              Break-even at {(currentRate! * 100).toFixed(4)}%/hr
            </span>
            <span className={`font-mono ${breakEven < 24 ? 'text-green-400' : breakEven < 72 ? 'text-yellow-400' : 'text-red-400'}`}>
              {breakEven < Infinity ? `${breakEven.toFixed(1)}h` : '∞'}
            </span>
          </div>
        )}
        {fees.stakingDiscountPct > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Staking discount</span>
            <span className="font-mono text-purple-400">−{fees.stakingDiscountPct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Footnote */}
      <div className="text-xs text-text-tertiary">
        Fees are based on your 14-day weighted volume and HYPE staking tier. Updated daily at UTC midnight.
        {fees.source === 'live' && fees.fetchedAt > 0 && (
          <> Last fetched: {new Date(fees.fetchedAt).toLocaleTimeString()}.</>
        )}
      </div>
    </div>
  );
};

export default FeeDisplay;
