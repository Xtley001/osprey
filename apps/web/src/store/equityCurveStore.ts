/**
 * equityCurveStore.ts — Live cumulative P&L time-series.
 * In-memory only. No localStorage. No demo data.
 * Appended on every harvest cycle completion.
 * See CALC_AUDIT.md §7 for formula details.
 */
import { create } from 'zustand';

export interface EquityPoint {
  timestamp:     number;  // unix ms
  cumulativeNet: number;  // total (fundingEarned - feesPaid) across all trades, open + closed
}

interface EquityCurveStore {
  curve:               EquityPoint[];
  highWaterMark:       number;
  append:              (point: EquityPoint) => void;
  reset:               () => void;
  updateHighWaterMark: (equity: number) => void;
}

export const useEquityCurveStore = create<EquityCurveStore>((set, get) => ({
  curve:         [],
  highWaterMark: 0,

  append: (point) => {
    set(s => ({ curve: [...s.curve, point].slice(-8760) }));  // 1 year of hourly points max
    get().updateHighWaterMark(point.cumulativeNet);
  },

  reset: () => set({ curve: [], highWaterMark: 0 }),

  updateHighWaterMark: (equity) => {
    set(s => ({ highWaterMark: Math.max(s.highWaterMark, equity) }));
  },
}));
