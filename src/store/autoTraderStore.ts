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
    const willEnable = !config.enabled;
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
      const mode   = appState.mode;
      const wallet = appState.wallet;

      if (pairs.length === 0) {
        set({ running: false });
        return;
      }

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

      const { actions, logLines } = runAutoTraderCycle(pairs, positions, regime, config);

      const newEntries: AutoTraderLogEntry[] = logLines.map(l => ({ ...l, id: _logId++ }));
      set(s => ({
        log: [...newEntries, ...s.log].slice(0, 200),
        nextRunAt: Date.now() + 60_000,
      }));

      for (const action of actions) {
        // ── EXIT ────────────────────────────────────────────────────────────
        if (action.type === 'EXIT') {
          usePositionStore.getState().closePosition(action.positionId);
          const pos = positions.find(p => p.id === action.positionId);
          if (pos) {
            // Charge exit (taker) fee at close — not pre-charged at entry
            const exitFee = pos.notional * DEFAULT_STRATEGY.takerFee;
            const totalFees = pos.feesPaid + exitFee;
            const net = pos.fundingEarned - totalFees;
            set(s => ({
              totalAutoEarned: s.totalAutoEarned + pos.fundingEarned,
              totalAutoFees:   s.totalAutoFees   + totalFees,
            }));
            toast.info(`Auto-exit ${action.symbol} · Net $${net.toFixed(2)}`);
          }
        }

        // ── ENTER ───────────────────────────────────────────────────────────
        if (action.type === 'ENTER') {
          const pair = pairs.find(p => p.symbol === action.symbol);
          if (!pair) continue;

          const notional = config.capitalPerPosition / 2;

          // Entry fee uses maker rate (Alo post-only order, default tif).
          // Exit fee (taker) is charged at close, not pre-loaded here.
          const entryFees = notional * DEFAULT_STRATEGY.makerFee;

          if (mode === 'real') {
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
            // Funding-arb entries are always short perp (isBuy: false).
            // This rests on the book and fills as maker (0.010% fee).
            // If rejected as "would cross", retry as taker (Ioc) automatically.
            const makerPx = pair.price * 0.9995;

            let result = await placeMarketOrder({
              coin: action.symbol, isBuy: false,
              sz: coinSz, px: makerPx,
              address: wallet.address, provider: eth,
              tif: 'Alo',   // post-only maker — 0.010% fee
            });

            // Fallback: if Alo was rejected (would cross book), fall back to Ioc
            if (!result.success && result.error?.includes('Would immediately cross')) {
              toast.info(`${action.symbol}: Alo rejected, retrying as Ioc`);
              result = await placeMarketOrder({
                coin: action.symbol, isBuy: false,
                sz: coinSz, px: pair.price * 0.99,
                address: wallet.address, provider: eth,
                tif: 'Ioc',   // taker fallback
              });
            }

            if (!result.success) {
              toast.error(`Auto-trader order failed: ${result.error}`);
              set(s => ({
                log: [{ id: _logId++, timestamp: Date.now(), type: 'ERROR', symbol: action.symbol, message: `Order failed: ${result.error}` }, ...s.log],
              }));
              continue;
            }

            const feeType = result.filledAsMaker ? 'maker (0.010%)' : 'taker (0.035%)';
            toast.success(`Auto-trade entered ${action.symbol} · Order ${result.orderId ?? 'confirmed'} · ${feeType}`);
          } else {
            toast.success(`Auto-trade (demo) entered ${action.symbol} · ${(action.rate * 100).toFixed(4)}%/hr`);
          }

          usePositionStore.getState().openPosition({
            symbol:        action.symbol,
            entryTime:     Date.now(),
            entryPrice:    pair.price,
            entryRate:     pair.currentRate,
            notional,
            fundingEarned: 0,
            feesPaid:      entryFees,   // maker entry fee only; exit fee added on close
            currentPrice:  pair.price,
            currentRate:   pair.currentRate,
            hedgeDrift:    0,
            hoursHeld:     0,
            isDemo:        mode === 'demo',
          });
        }

        // ── ROTATE ──────────────────────────────────────────────────────────
        if (action.type === 'ROTATE') {
          usePositionStore.getState().closePosition(action.positionId);
          const oldPos = positions.find(p => p.id === action.positionId);
          if (oldPos) {
            // Charge exit (taker) fee on the closing leg
            const exitFee  = oldPos.notional * DEFAULT_STRATEGY.takerFee;
            const totalFees = oldPos.feesPaid + exitFee;
            set(s => ({
              totalAutoFees: s.totalAutoFees + totalFees,
            }));
          }

          const newPair = pairs.find(p => p.symbol === action.toSymbol);
          if (!newPair) continue;

          const notional  = config.capitalPerPosition / 2;
          const entryFees = notional * DEFAULT_STRATEGY.makerFee;   // maker entry

          if (mode === 'real') {
            const eth = (window as Window & { ethereum?: unknown }).ethereum;
            if (!eth || !wallet.address) continue;
            if (!newPair.price || newPair.price <= 0) {
              toast.error(`Auto-rotate: no valid price for ${action.toSymbol} — skipping`);
              continue;
            }
            const coinSz  = parseFloat((notional / newPair.price).toFixed(4));
            const makerPx = newPair.price * 0.9995;

            let result = await placeMarketOrder({
              coin: action.toSymbol, isBuy: false, sz: coinSz, px: makerPx,
              address: wallet.address, provider: eth,
              tif: 'Alo',
            });

            if (!result.success && result.error?.includes('Would immediately cross')) {
              result = await placeMarketOrder({
                coin: action.toSymbol, isBuy: false, sz: coinSz, px: newPair.price * 0.99,
                address: wallet.address, provider: eth,
                tif: 'Ioc',
              });
            }

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
