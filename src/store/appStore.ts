import { create } from 'zustand';
import { useFeeStore } from './feeStore';
import type { AccountMode, WalletState, RegimeState } from '../types/account';

interface AppStore {
  mode: AccountMode;
  selectedPair: string | null;
  wallet: WalletState;
  regime: RegimeState;
  prevRegimeAvg: number;
  accountMarginBuffer: number;
  setSelectedPair: (symbol: string | null) => void;
  setWallet: (w: Partial<WalletState>) => void;
  setRegime: (r: RegimeState) => void;
  setPrevRegimeAvg: (avg: number) => void;
  setAccountMarginBuffer: (pct: number) => void;
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
  mode: 'live',   // always live — there is no other mode
  selectedPair: null,
  wallet: {
    address:              null,
    connected:            false,
    balance:              0,
    network:              'mainnet',
    canTradeAutonomously: false,
    method:               'none',
    walletName:           '',
    agentAddress:         null,
  },
  regime: DEFAULT_REGIME,
  prevRegimeAvg: 0,
  accountMarginBuffer: 100,

  setSelectedPair: (selectedPair) => set({ selectedPair }),

  setWallet: (w) => {
    set((s) => ({ wallet: { ...s.wallet, ...w } }));
    if (w.connected && w.address) {
      useFeeStore.getState().fetchFees(w.address);
    }
    if (!w.connected) {
      useFeeStore.getState().clearFees();
    }
  },

  setRegime: (regime) => set({ regime }),
  setPrevRegimeAvg: (prevRegimeAvg) => set({ prevRegimeAvg }),
  setAccountMarginBuffer: (accountMarginBuffer) => set({ accountMarginBuffer }),
}));
