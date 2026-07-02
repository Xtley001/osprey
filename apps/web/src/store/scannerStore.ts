import { create } from 'zustand';
import {
  fetchFundingRates,
  fetchFundingHistory,
  classifyRate,
  computeSignal,
  DEFAULT_HARVEST_CONFIG,
  type FundingRate,
  type Category,
  type SortKey,
  type FundingEvent,
} from '@osprey/engine';

interface ScannerStore {
  pairs:         FundingRate[];
  filteredPairs: FundingRate[];
  filter:        Category;
  sortBy:        SortKey;
  lastUpdated:   number;
  isLoading:     boolean;
  error:         string | null;
  searchQuery:   string;
  setFilter:  (f: Category) => void;
  setSortBy:  (s: SortKey)  => void;
  setSearch:  (q: string)   => void;
  fetchRates: () => Promise<void>;
  clearError: () => void;
}

function computeFiltered(
  pairs:       FundingRate[],
  filter:      Category,
  sortBy:      SortKey,
  searchQuery: string
): FundingRate[] {
  let result = pairs;
  if (filter !== 'All') result = result.filter(p => p.category === filter);
  if (searchQuery) {
    const q = searchQuery.toUpperCase();
    result = result.filter(p => p.symbol.includes(q));
  }
  return [...result].sort((a, b) => {
    switch (sortBy) {
      case 'rate':        return b.currentRate   - a.currentRate;
      case 'oi':          return b.openInterest  - a.openInterest;
      case 'volume':      return b.volume24h     - a.volume24h;
      case 'annualYield': return b.annualYield   - a.annualYield;
      default:            return 0;
    }
  });
}

// Track previous rates for trend direction
const _prevRates: Map<string, number> = new Map();

export const useScannerStore = create<ScannerStore>((set, get) => ({
  pairs:         [],
  filteredPairs: [],
  filter:        'All',
  sortBy:        'rate',
  lastUpdated:   0,
  isLoading:     false,
  error:         null,
  searchQuery:   '',

  setFilter: (filter) => {
    const s = get();
    set({ filter, filteredPairs: computeFiltered(s.pairs, filter, s.sortBy, s.searchQuery) });
  },

  setSortBy: (sortBy) => {
    const s = get();
    set({ sortBy, filteredPairs: computeFiltered(s.pairs, s.filter, sortBy, s.searchQuery) });
  },

  setSearch: (searchQuery) => {
    const s = get();
    set({ searchQuery, filteredPairs: computeFiltered(s.pairs, s.filter, s.sortBy, searchQuery) });
  },

  clearError: () => set({ error: null }),

  fetchRates: async () => {
    set({ isLoading: true, error: null });
    try {
      const raw = await fetchFundingRates();
      const now = Date.now();
      const lookback7d = now - 7 * 24 * 3_600_000;

      // Top 50 by OI for history fetch (performance cap)
      const top50 = [...raw].sort((a, b) => b.openInterest - a.openInterest).slice(0, 50);

      const historyMap = new Map<string, FundingEvent[]>();
      await Promise.allSettled(
        top50.map(async (p) => {
          try {
            const hist = await fetchFundingHistory(p.symbol, lookback7d, now);
            historyMap.set(p.symbol, hist);
          } catch { /* non-critical — pair gets persistenceHours: 0, sparkline7d: [] */ }
        })
      );

      // Read thresholds from DEFAULT_HARVEST_CONFIG to avoid circular store dep
      const { entryThreshold, exitThreshold } = DEFAULT_HARVEST_CONFIG;

      const pairs: FundingRate[] = raw.map(p => {
        const hist   = historyMap.get(p.symbol) ?? [];
        const signal = computeSignal(p.currentRate, hist, entryThreshold, exitThreshold);

        // sparkline7d: last 168 hourly rates, oldest first
        const sparkline7d = [...hist]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-168)
          .map(e => e.rate);

        const prev  = _prevRates.get(p.symbol);
        const trend = prev === undefined ? 'stable'
          : p.currentRate > prev * 1.05 ? 'rising'
          : p.currentRate < prev * 0.95 ? 'falling'
          : 'stable';
        _prevRates.set(p.symbol, p.currentRate);

        return {
          ...p,
          heat:             classifyRate(p.currentRate),
          trend,
          persistenceHours: signal.persistenceHours,
          sparkline7d,
        };
      });

      const s = get();
      set({
        pairs,
        filteredPairs: computeFiltered(pairs, s.filter, s.sortBy, s.searchQuery),
        lastUpdated: now,
        error: null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
    } finally {
      set({ isLoading: false });
    }
  },
}));
