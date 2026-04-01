import { create } from 'zustand';
import type { AccountMode, WalletState, DemoAccount, RegimeState } from '../types/account';
import { DEMO_INITIAL_BALANCE } from '../utils/constants';

interface AppStore {
  mode: AccountMode;
  selectedPair: string | null;
  wallet: WalletState;
  demo: DemoAccount;
  regime: RegimeState;
  prevRegimeAvg: number;   // persisted between detectRegime calls for trend tracking
  setMode: (mode: AccountMode) => void;
  setSelectedPair: (symbol: string | null) => void;
  setWallet: (w: Partial<WalletState>) => void;
  updateDemo: (delta: Partial<DemoAccount>) => void;
  resetDemo: () => void;
  setRegime: (r: RegimeState) => void;
  setPrevRegimeAvg: (avg: number) => void;
}

const DEFAULT_REGIME: RegimeState = {
  label: 'NEUTRAL',
  marketAvgRate: 0.00042,
  breadth: 0.45,
  trend: 'stable',
  hoursInRegime: 6,
  confidence: 72,
};

export const useAppStore = create<AppStore>((set) => ({
  mode: 'demo',
  selectedPair: null,
  wallet: { address: null, connected: false, balance: 0, network: 'mainnet' },
  demo: { balance: DEMO_INITIAL_BALANCE, initialBalance: DEMO_INITIAL_BALANCE, fundingEarned: 0, feesPaid: 0 },
  regime: DEFAULT_REGIME,
  prevRegimeAvg: 0,
  setMode: (mode) => set({ mode }),
  setSelectedPair: (selectedPair) => set({ selectedPair }),
  setWallet: (w) => set((s) => ({ wallet: { ...s.wallet, ...w } })),
  updateDemo: (delta) => set((s) => ({ demo: { ...s.demo, ...delta } })),
  resetDemo: () => set({ demo: { balance: DEMO_INITIAL_BALANCE, initialBalance: DEMO_INITIAL_BALANCE, fundingEarned: 0, feesPaid: 0 } }),
  setRegime: (regime) => set({ regime }),
  setPrevRegimeAvg: (prevRegimeAvg) => set({ prevRegimeAvg }),
}));
