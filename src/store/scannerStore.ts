import { create } from 'zustand';
import type { FundingRate, Category, SortKey } from '../types/funding';
import { fetchFundingRates } from '../api/hyperliquid';
import { classifyRate } from '../utils/rateColor';

interface ScannerStore {
  pairs: FundingRate[];
  filteredPairs: FundingRate[];
  filter: Category;
  sortBy: SortKey;
  lastUpdated: number;
  isLoading: boolean;
  searchQuery: string;
  setFilter: (f: Category) => void;
  setSortBy: (s: SortKey) => void;
  setSearch: (q: string) => void;
  fetchRates: () => Promise<void>;
}

function computeFiltered(
  pairs: FundingRate[],
  filter: Category,
  sortBy: SortKey,
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
      case 'rate':        return b.currentRate - a.currentRate;
      case 'oi':          return b.openInterest - a.openInterest;
      case 'volume':      return b.volume24h - a.volume24h;
      case 'annualYield': return b.annualYield - a.annualYield;
      default:            return 0;
    }
  });
}

export const useScannerStore = create<ScannerStore>((set, get) => ({
  pairs: [],
  filteredPairs: [],
  filter: 'All',
  sortBy: 'rate',
  lastUpdated: 0,
  isLoading: false,
  searchQuery: '',

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
  fetchRates: async () => {
    set({ isLoading: true });
    try {
      const raw = await fetchFundingRates();
      const pairs = raw.map(p => ({ ...p, heat: classifyRate(p.currentRate) }));
      const s = get();
      const filteredPairs = computeFiltered(pairs, s.filter, s.sortBy, s.searchQuery);
      set({ pairs, filteredPairs, lastUpdated: Date.now() });
    } finally {
      set({ isLoading: false });
    }
  },
}));
