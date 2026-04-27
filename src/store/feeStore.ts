/**
 * Fee Store — live fee management.
 *
 * Fetches the user's actual HL fee tier on wallet connect and
 * refreshes every 24 hours (fees update daily at UTC midnight).
 *
 * All trading logic in harvestStore, backtester, and display
 * components consume fees from here — never from hardcoded values.
 */

import { create } from 'zustand';
import {
  fetchUserFees,
  computeBreakEvenHours,
  FALLBACK_FEES,
  type OspreyFees,
} from '../api/fees';

const FEE_TTL_MS = 24 * 60 * 60 * 1_000;   // refresh every 24h
const FEE_RETRY_MS = 5 * 60 * 1_000;        // retry on failure after 5min

interface FeeStore {
  fees:        OspreyFees;
  loading:     boolean;
  error:       string | null;
  lastFetched: number;

  fetchFees:   (address: string) => Promise<void>;
  clearFees:   () => void;
  getFees:     () => OspreyFees;

  // Convenience — break-even hours at the current funding rate
  breakEvenHours: (fundingRateHr: number) => number;
}

export const useFeeStore = create<FeeStore>((set, get) => ({
  fees:        FALLBACK_FEES,
  loading:     false,
  error:       null,
  lastFetched: 0,

  fetchFees: async (address: string) => {
    const { loading, lastFetched } = get();
    if (loading) return;

    const age = Date.now() - lastFetched;
    if (age < FEE_TTL_MS && lastFetched > 0) return;  // still fresh

    set({ loading: true, error: null });
    try {
      const fees = await fetchUserFees(address);
      set({ fees, loading: false, lastFetched: Date.now(), error: null });
      console.log('[fees] Live fees fetched:', fees);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({
        loading:     false,
        error:       msg,
        // Keep whatever fees we had — fallback stays if this is first fetch
        lastFetched: Date.now() - FEE_TTL_MS + FEE_RETRY_MS,
      });
      console.warn('[fees] Fetch failed, using fallback:', msg);
    }
  },

  clearFees: () => {
    set({ fees: FALLBACK_FEES, lastFetched: 0, error: null });
  },

  getFees: () => get().fees,

  breakEvenHours: (fundingRateHr: number) =>
    computeBreakEvenHours(fundingRateHr, get().fees),
}));

// Re-export for convenience
export type { OspreyFees };
