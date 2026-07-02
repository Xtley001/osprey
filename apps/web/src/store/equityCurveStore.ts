/**
 * equityCurveStore.ts — Live cumulative P&L time-series.
 * Appended on every harvest cycle completion.
 * See CALC_AUDIT.md §7 for formula details.
 *
 * Audit P0-5: persisted to localStorage (key osprey-equity-v1) so the equity
 * curve, high-water mark, and drawdown survive a reload — previously the whole
 * curve was wiped on every refresh, which is fatal for a "LIVE" P&L view.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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

export const useEquityCurveStore = create<EquityCurveStore>()(
  persist(
    (set, get) => ({
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
    }),
    {
      name:    'osprey-equity-v1',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
