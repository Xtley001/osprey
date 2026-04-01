import { create } from 'zustand';
import type { FundingRate, Category, SortKey } from '../types/funding';
import { fetchFundingRates } from '../api/hyperliquid';
import { classifyRate } from '../utils/rateColor';

interface ScannerStore {
  pairs:         FundingRate[];
  filteredPairs: FundingRate[];
  filter:        Category;
  sortBy:        SortKey;
  lastUpdated:   number;
  isLoading:     boolean;
  error:         string | null;   // null = no error, string = shown to user
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

// Track previous rates to compute trend direction
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

      // Compute trend by comparing to previous fetch
      const pairs = raw.map(p => {
        const prev = _prevRates.get(p.symbol);
        const trend = prev === undefined ? 'stable'
          : p.currentRate > prev * 1.05 ? 'rising'
          : p.currentRate < prev * 0.95 ? 'falling'
          : 'stable';
        _prevRates.set(p.symbol, p.currentRate);
        return { ...p, heat: classifyRate(p.currentRate), trend } as FundingRate;
      });

      const s = get();
      const filteredPairs = computeFiltered(pairs, s.filter, s.sortBy, s.searchQuery);
      set({ pairs, filteredPairs, lastUpdated: Date.now(), error: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      // Don't clear pairs on error — keep showing last good data with a banner
    } finally {
      set({ isLoading: false });
    }
  },
}));
