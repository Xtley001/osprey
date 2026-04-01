import { create } from 'zustand';
import type { Position, Trade } from '../types/position';

interface PositionStore {
  positions: Position[];
  trades: Trade[];
  openPosition: (p: Omit<Position, 'id'>) => string;
  closePosition: (id: string) => void;
  creditFunding: (id: string, amount: number) => void;
  updatePosition: (id: string, delta: Partial<Position>) => void;
  clearAll: () => void;
}

let posIdCounter = 1;

export const usePositionStore = create<PositionStore>((set, get) => ({
  positions: [],
  trades: [],

  openPosition: (p) => {
    const id = `pos-${posIdCounter++}`;
    set(s => ({ positions: [...s.positions, { ...p, id }] }));
    return id;
  },

  closePosition: (id) => {
    const pos = get().positions.find(p => p.id === id);
    if (!pos) return;
    // grossFunding is what was actually earned; fees is what was paid
    const trade: Trade = {
      id: `trade-${Date.now()}-${id}`,
      symbol: pos.symbol,
      entryTime: pos.entryTime,
      exitTime: Date.now(),
      hoursHeld: pos.hoursHeld,
      avgRate: pos.hoursHeld > 0 ? pos.fundingEarned / (pos.notional * pos.hoursHeld) : pos.entryRate,
      grossFunding: pos.fundingEarned,
      fees: pos.feesPaid,
      net: pos.fundingEarned - pos.feesPaid,
      isDemo: pos.isDemo,
    };
    set(s => ({
      positions: s.positions.filter(p => p.id !== id),
      trades: [...s.trades, trade],
    }));
  },

  creditFunding: (id, amount) => {
    set(s => ({
      positions: s.positions.map(p =>
        p.id === id ? { ...p, fundingEarned: p.fundingEarned + amount } : p
      ),
    }));
  },

  updatePosition: (id, delta) => {
    set(s => ({
      positions: s.positions.map(p => p.id === id ? { ...p, ...delta } : p),
    }));
  },

  clearAll: () => set({ positions: [], trades: [] }),
}));
