import { create } from 'zustand';
import type { AutoTraderConfig, AutoTraderLogEntry, AutoTraderState } from '../types/autotrader';
import { DEFAULT_AUTO_CONFIG } from '../types/autotrader';
import { runAutoTraderCycle, setHistoryCache } from '../engine/autotrader';
import { useScannerStore } from './scannerStore';
import { usePositionStore } from './positionStore';
import { useAppStore } from './appStore';
import { detectRegime } from '../engine/regime';
import { fetchFundingHistory, placeMarketOrder } from '../api/hyperliquid';
import { DEFAULT_STRATEGY } from '../utils/constants';
import { toast } from '../components/shared/Toast';

let _logId = 1;

interface AutoTraderStore extends AutoTraderState {
  updateConfig:  (delta: Partial<AutoTraderConfig>) => void;
  toggle:        () => void;
  runCycle:      () => Promise<void>;
  clearLog:      () => void;
}

export const useAutoTraderStore = create<AutoTraderStore>((set, get) => ({
  config:          { ...DEFAULT_AUTO_CONFIG },
  running:         false,
  lastRunAt:       0,
  nextRunAt:       0,
  log:             [],
  totalAutoEarned: 0,
  totalAutoFees:   0,

  updateConfig: (delta) => {
    set(s => ({ config: { ...s.config, ...delta } }));
  },

  toggle: () => {
    const { config } = get();
    const appMode = useAppStore.getState().mode;

    // Capture intended state BEFORE mutating store
    const willEnable = !config.enabled;

    // Safety: auto-trader mode must match app mode
    if (willEnable && config.mode !== appMode) {
      set(s => ({ config: { ...s.config, mode: appMode } }));
    }
    set(s => ({ config: { ...s.config, enabled: !s.config.enabled } }));

    if (willEnable) {
      toast.success(`Auto-trader enabled (${appMode} mode)`);
    } else {
      toast.info('Auto-trader paused');
    }
  },

  clearLog: () => set({ log: [] }),

  runCycle: async () => {
    const { config, running } = get();
    if (!config.enabled || running) return;

    set({ running: true, lastRunAt: Date.now() });

    try {
      const pairs     = useScannerStore.getState().pairs;
      const positions = usePositionStore.getState().positions;
      const appState  = useAppStore.getState();
      const { regime, nextPrevAvg } = detectRegime(pairs, appState.prevRegimeAvg);
      appState.setPrevRegimeAvg(nextPrevAvg);
      appState.setRegime(regime);
      const mode      = appState.mode;
      const wallet    = appState.wallet;

      if (pairs.length === 0) {
        set({ running: false });
        return;
      }

      // Fetch recent funding history for top candidates (for signal confirmation)
      const topCandidates = [...pairs]
        .filter(p => p.currentRate >= config.entryThreshold * 0.8)
        .sort((a, b) => b.currentRate - a.currentRate)
        .slice(0, 10);

      await Promise.allSettled(
        topCandidates.map(async (p) => {
          try {
            const history = await fetchFundingHistory(p.symbol, Date.now() - 6 * 3_600_000, Date.now());
            setHistoryCache(p.symbol, history);
          } catch { /* skip — signal engine will see empty history and WAIT */ }
        })
      );

      // Run the decision engine
      const { actions, logLines } = runAutoTraderCycle(pairs, positions, regime, config);

      // Append log entries
      const newEntries: AutoTraderLogEntry[] = logLines.map(l => ({ ...l, id: _logId++ }));
      set(s => ({
        log: [...newEntries, ...s.log].slice(0, 200), // keep last 200 entries
        nextRunAt: Date.now() + 60_000,
      }));

      // Execute actions
      for (const action of actions) {
        if (action.type === 'EXIT') {
          usePositionStore.getState().closePosition(action.positionId);
          const pos = positions.find(p => p.id === action.positionId);
          if (pos) {
            const net = pos.fundingEarned - pos.feesPaid;
            set(s => ({
              totalAutoEarned: s.totalAutoEarned + pos.fundingEarned,
              totalAutoFees:   s.totalAutoFees   + pos.feesPaid,
            }));
            toast.info(`Auto-exit ${action.symbol} · Net $${net.toFixed(2)}`);
          }
        }

        if (action.type === 'ENTER') {
          const pair = pairs.find(p => p.symbol === action.symbol);
          if (!pair) continue;

          const notional = config.capitalPerPosition / 2;
          const entryFees = notional * DEFAULT_STRATEGY.takerFee * 2;

          if (mode === 'real') {
            // Real order: submit to HL
            if (!wallet.connected || !wallet.address) {
              toast.error('Auto-trader: wallet not connected — cannot enter real positions');
              set(s => ({
                config: { ...s.config, enabled: false },
                log: [{ id: _logId++, timestamp: Date.now(), type: 'ERROR', symbol: action.symbol, message: 'Wallet not connected — auto-trader disabled' }, ...s.log],
              }));
              break;
            }
            const eth = (window as Window & { ethereum?: unknown }).ethereum;
            if (!eth) {
              toast.error('Auto-trader: MetaMask not found');
              break;
            }
            if (!pair.price || pair.price <= 0) {
              toast.error(`Auto-trader: no valid price for ${action.symbol} — skipping`);
              continue;
            }
            const coinSz  = parseFloat((notional / pair.price).toFixed(4));
            const worstPx = pair.price * 0.99;
            const result  = await placeMarketOrder({
              coin: action.symbol, isBuy: false, sz: coinSz, px: worstPx,
              address: wallet.address, provider: eth,
            });
            if (!result.success) {
              toast.error(`Auto-trader order failed: ${result.error}`);
              set(s => ({
                log: [{ id: _logId++, timestamp: Date.now(), type: 'ERROR', symbol: action.symbol, message: `Order failed: ${result.error}` }, ...s.log],
              }));
              continue;
            }
            toast.success(`Auto-trade entered ${action.symbol} · Order ${result.orderId ?? 'confirmed'}`);
          } else {
            toast.success(`Auto-trade (demo) entered ${action.symbol} · ${(action.rate * 100).toFixed(4)}%/hr`);
          }

          // Track in position store
          usePositionStore.getState().openPosition({
            symbol:        action.symbol,
            entryTime:     Date.now(),
            entryPrice:    pair.price,
            entryRate:     pair.currentRate,
            notional,
            fundingEarned: 0,
            feesPaid:      entryFees,
            currentPrice:  pair.price,
            currentRate:   pair.currentRate,
            hedgeDrift:    0,
            hoursHeld:     0,
            isDemo:        mode === 'demo',
          });
        }

        if (action.type === 'ROTATE') {
          // Close current, enter new
          usePositionStore.getState().closePosition(action.positionId);
          const newPair = pairs.find(p => p.symbol === action.toSymbol);
          if (!newPair) continue;

          const notional  = config.capitalPerPosition / 2;
          const entryFees = notional * DEFAULT_STRATEGY.takerFee * 2;

          if (mode === 'real') {
            const eth = (window as Window & { ethereum?: unknown }).ethereum;
            if (!eth || !wallet.address) continue;
            if (!newPair.price || newPair.price <= 0) {
              toast.error(`Auto-rotate: no valid price for ${action.toSymbol} — skipping`);
              continue;
            }
            const coinSz  = parseFloat((notional / newPair.price).toFixed(4));
            const worstPx = newPair.price * 0.99;
            const result  = await placeMarketOrder({
              coin: action.toSymbol, isBuy: false, sz: coinSz, px: worstPx,
              address: wallet.address, provider: eth,
            });
            if (!result.success) {
              toast.error(`Auto-rotate failed: ${result.error}`);
              continue;
            }
          }

          usePositionStore.getState().openPosition({
            symbol:        action.toSymbol,
            entryTime:     Date.now(),
            entryPrice:    newPair.price,
            entryRate:     newPair.currentRate,
            notional,
            fundingEarned: 0,
            feesPaid:      entryFees,
            currentPrice:  newPair.price,
            currentRate:   newPair.currentRate,
            hedgeDrift:    0,
            hoursHeld:     0,
            isDemo:        mode === 'demo',
          });
          toast.success(`Auto-rotate ${action.fromSymbol} → ${action.toSymbol} · Est. $${action.gain.toFixed(2)}/day gain`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set(s => ({
        log: [{ id: _logId++, timestamp: Date.now(), type: 'ERROR', symbol: '', message: `Cycle error: ${msg}` }, ...s.log],
      }));
    } finally {
      set({ running: false });
    }
  },
}));
