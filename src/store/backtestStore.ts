import { create } from 'zustand';
import type { BacktestParams, BacktestResult } from '../types/backtest';
import { runBacktest } from '../engine/backtester';
import { fetchFundingHistory, fetchCandles } from '../api/hyperliquid';
import { toast } from '../components/shared/Toast';

interface BacktestStore {
  params:       BacktestParams | null;
  result:       BacktestResult | null;
  savedResults: BacktestResult[];
  isRunning:    boolean;
  error:        string | null;
  setParams:    (p: BacktestParams) => void;
  runBacktest:  (p: BacktestParams) => Promise<void>;
  saveResult:   () => void;
  clearResult:  () => void;
}

const STORAGE_KEY = 'osprey_backtest_results';

function loadSaved(): BacktestResult[] {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (!r) return [];
    const parsed = JSON.parse(r) as BacktestResult[];
    // JSON.stringify converts Date → ISO string; restore them on load
    return parsed.map(bt => ({
      ...bt,
      params: {
        ...bt.params,
        startDate: new Date(bt.params.startDate),
        endDate:   new Date(bt.params.endDate),
      },
    }));
  } catch { return []; }
}

export const useBacktestStore = create<BacktestStore>((set, get) => ({
  params:       null,
  result:       null,
  savedResults: loadSaved(),
  isRunning:    false,
  error:        null,

  setParams: (params) => set({ params }),

  runBacktest: async (params) => {
    set({ isRunning: true, error: null, result: null });
    try {
      const start = params.startDate.getTime();
      const end   = params.endDate.getTime();

      const [funding, candles] = await Promise.all([
        fetchFundingHistory(params.symbol, start, end),
        fetchCandles(params.symbol, undefined, start, end),
      ]);

      const result = runBacktest(params, funding, candles);
      set({ result, params, isRunning: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({
        error: msg.includes('no data') || msg.includes('empty')
          ? `No historical data available for ${params.symbol} in this date range. Try a shorter range or a more liquid pair.`
          : `Backtest failed: ${msg}`,
        isRunning: false,
      });
    }
  },

  saveResult: () => {
    const { result, savedResults } = get();
    if (!result) return;

    // Prevent saving the exact same run twice (same runAt timestamp)
    const alreadySaved = savedResults.some(r => r.runAt === result.runAt);
    if (alreadySaved) {
      toast.warning('This result is already saved.');
      return;
    }

    try {
      const updated = [result, ...savedResults].slice(0, 10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      set({ savedResults: updated });
      toast.success(`Saved — ${updated.length}/10 results stored`);
    } catch {
      toast.error('Save failed — localStorage may be full or blocked');
    }
  },

  clearResult: () => set({ result: null, error: null }),
}));
