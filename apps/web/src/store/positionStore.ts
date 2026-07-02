/**
 * positionStore — open positions + trade history.
 *
 * Phase 5 / P0-06 / ST-01/ST-02: wrapped with Zustand persist middleware
 * (localStorage, key osprey-positions-v1) so positions survive a page reload.
 *
 * Phase 4 / UPDATE.md §1: creditFunding is DEAD CODE (never called, additive
 * which compounds incorrectly vs HL's cumulative cumFunding.sinceOpen).
 * Removed per Phase 4.2 decision (a) to avoid future misuse.
 * Use updatePosition(id, { fundingEarned: <absolute value> }) everywhere.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Position, Trade } from '@osprey/engine';

interface PositionStore {
  positions: Position[];
  trades:    Trade[];
  openPosition:   (p: Omit<Position, 'id'>) => string;
  closePosition:  (id: string) => void;
  updatePosition: (id: string, delta: Partial<Position>) => void;
  clearAll:       () => void;
}

// IDs must stay unique across page reloads: positions persist to localStorage
// but module state does not, so a plain counter would collide after reload.
function newPositionId(): string {
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePositionStore = create<PositionStore>()(
  persist(
    (set, get) => ({
      positions: [],
      trades:    [],

      openPosition: (p) => {
        const id = newPositionId();
        set(s => ({ positions: [...s.positions, { ...p, id }] }));
        return id;
      },

      closePosition: (id) => {
        const pos = get().positions.find(p => p.id === id);
        if (!pos) return;
        const trade: Trade = {
          id:           `trade-${Date.now()}-${id}`,
          symbol:       pos.symbol,
          entryTime:    pos.entryTime,
          exitTime:     Date.now(),
          hoursHeld:    pos.hoursHeld,
          avgRate:      pos.hoursHeld > 0
            ? pos.fundingEarned / (pos.notional * pos.hoursHeld)
            : pos.entryRate,
          grossFunding: pos.fundingEarned,
          fees:         pos.feesPaid,
          net:          pos.fundingEarned - pos.feesPaid,
        };
        set(s => ({
          positions: s.positions.filter(p => p.id !== id),
          trades:    [...s.trades, trade],
        }));
      },

      // Phase 4.2: creditFunding removed (was additive, never called, dead code).
      // Use updatePosition(id, { fundingEarned: absoluteValue }) instead.

      updatePosition: (id, delta) => {
        set(s => ({
          positions: s.positions.map(p => p.id === id ? { ...p, ...delta } : p),
        }));
      },

      clearAll: () => set({ positions: [], trades: [] }),
    }),
    {
      name:    'osprey-positions-v1',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
