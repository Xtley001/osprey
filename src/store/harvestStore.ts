/**
 * Harvest Store — live-only orchestration.
 * Phase 1: demo mode removed entirely.
 * Phase 2: equity curve wired, circuit breaker, fixed shouldRotate (Bugs B1+B2).
 *
 * Agent Key required for automated trading.
 * WalletConnect can only be used for approveAgent signing, never trade orders.
 */

import { create } from 'zustand';
import type { HarvestConfig, HarvestLogEntry, HarvestState } from '../types/harvest';
import { DEFAULT_HARVEST_CONFIG } from '../types/harvest';
import { runHarvestCycle, setHistoryCache } from '../engine/harvest';
import { useScannerStore } from './scannerStore';
import { usePositionStore } from './positionStore';
import { useAppStore } from './appStore';
import { useEquityCurveStore } from './equityCurveStore';
import { detectRegime } from '../engine/regime';
import {
  fetchFundingHistory,
  fetchAccountState,
  fetchOpenOrders,
  placeMarketOrder,
  placeSpotOrder,
  cancelOrder,
} from '../api/hyperliquid';
import { detectInjectedWallet, buildSigner } from '../api/signing';
import { getActiveSigner } from '../hooks/useWallet';
import { useFeeStore } from './feeStore';
import { toast } from '../components/shared/Toast';

let _logId = 1;

// ── Phase 2.2: fill-confirmation helper ──────────────────────────────────────
// For Ioc (immediate) fills: returns true instantly — no poll needed.
// For Alo (resting/maker) orders: polls fetchOpenOrders every 2s up to 15s.
// If the oid disappears from open orders → filled.  If timeout → cancel.
const FILL_POLL_INTERVAL_MS = 2_000;
const FILL_TIMEOUT_MS       = 15_000;

async function confirmOrderFilled(params: {
  coin:          string;
  orderId:       string | undefined;
  address:       string;
  filledAsMaker: boolean | undefined;
  signer:        import('ethers').Signer;
}): Promise<boolean> {
  // Ioc / taker fills are immediate — no poll needed
  if (!params.filledAsMaker) return true;
  // No orderId means something unexpected happened — treat as not filled
  if (!params.orderId) return false;

  const oid    = parseInt(params.orderId, 10);
  const start  = Date.now();

  while (Date.now() - start < FILL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, FILL_POLL_INTERVAL_MS));
    const open = await fetchOpenOrders(params.address);
    if (open === null) continue;   // transient fetch error — keep polling
    const stillOpen = open.some(o => o.oid === oid && o.coin === params.coin);
    if (!stillOpen) return true;   // order left open orders → filled or already gone
  }

  // Timeout — cancel the resting order
  await cancelOrder({ coin: params.coin, orderId: oid, address: params.address, signer: params.signer });
  return false;
}

// ── Phase 3.1: close HL position helper ──────────────────────────────────────
// Sources live sz from fetchAccountState so we never guess from local notional.
// Uses Ioc TIF (taker) for exits — certainty > maker rebate.
async function closeHLPosition(params: {
  symbol:  string;
  address: string;
  signer:  import('ethers').Signer;
}): Promise<{ closed: boolean; hadLiveExposure: boolean }> {
  const acct = await fetchAccountState(params.address);
  if (!acct) return { closed: false, hadLiveExposure: false };

  const hlPos = acct.positions.find(p => p.position.coin === params.symbol);
  const szi   = parseFloat(hlPos?.position?.szi ?? '0');

  if (!hlPos || szi === 0) {
    // No live HL exposure — local tracking phantom; caller closes locally only
    return { closed: true, hadLiveExposure: false };
  }

  const sz    = Math.abs(szi);
  // Osprey opens shorts (szi < 0).  To close a short: buy (isBuy=true).
  // Log a warning if we ever see a long (szi > 0) — unexpected state.
  const isBuy = szi < 0;
  if (szi > 0) {
    // Unexpected long on HL — still close it, but surface the anomaly
    console.warn(`[closeHLPosition] Unexpected long position for ${params.symbol} (szi=${szi}) — closing anyway`);
  }

  // Use mark price from accountState for limit price; fall back to a wide Ioc
  const markPx = parseFloat(hlPos.position.entryPx ?? '0') || 99999999;

  const result = await placeMarketOrder({
    coin: params.symbol, isBuy, sz, px: markPx,
    address: params.address, signer: params.signer,
    // Ioc for exits: certainty > maker rebate (see Phase 3 rationale in UPDATE.md)
    tif: 'Ioc',
  });

  if (!result.success) return { closed: false, hadLiveExposure: true };

  // Ioc fills are immediate — fill confirmation returns true instantly
  const filled = await confirmOrderFilled({
    coin: params.symbol,
    orderId: result.orderId,
    address: params.address,
    filledAsMaker: result.filledAsMaker,
    signer: params.signer,
  });

  return { closed: filled, hadLiveExposure: true };
}

interface HarvestStore extends HarvestState {
  /** P0-09: arm gate — must be true before toggle() enables the engine. */
  armed:         boolean;
  arm:           () => void;
  updateConfig:  (delta: Partial<HarvestConfig>) => void;
  toggle:        () => void;
  runCycle:      () => Promise<void>;
  clearLog:      () => void;
}

export const useHarvestStore = create<HarvestStore>((set, get) => ({
  config:          { ...DEFAULT_HARVEST_CONFIG },
  armed:           false,
  running:         false,
  lastRunAt:       0,
  nextRunAt:       0,
  log:             [],
  totalAutoEarned: 0,
  totalAutoFees:   0,

  updateConfig: (delta) => {
    set(s => ({ config: { ...s.config, ...delta } }));
  },

  // P0-09: arm() is called by ArmEngineModal's explicit "Arm" button only.
  arm: () => set({ armed: true }),

  toggle: () => {
    const { config, armed } = get();
    const willEnable = !config.enabled;
    // P0-09: guard — enabling requires prior arm() call from the modal.
    if (willEnable && !armed) return;
    set(s => ({
      config: { ...s.config, enabled: !s.config.enabled },
      // Reset armed when engine is disabled so next enable requires a fresh confirm.
      armed: willEnable ? s.armed : false,
    }));
    if (willEnable) {
      toast.success('Harvest engine enabled (live mode)');
    } else {
      toast.info('Harvest engine paused');
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
      const wallet = appState.wallet;

      if (pairs.length === 0) { set({ running: false }); return; }

      // Update live margin buffer (CALC_AUDIT.md §6.3 — liquidation buffer check)
      // Phase 4.2: also sync funding accrual (F-03) from cumFunding.sinceOpen.
      // Use updatePosition (SET) not creditFunding (ADDITIVE) — see §1 of UPDATE.md.
      if (wallet.connected && wallet.address) {
        try {
          const acct = await fetchAccountState(wallet.address);
          if (acct) {
            appState.setWallet({ balance: acct.balance });
            appState.setAccountMarginBuffer(acct.marginBuffer);

            // Phase 4.2 / P0-03 / F-03: funding sync from HL (absolute SET, not additive)
            for (const hlPos of acct.positions) {
              const local = positions.find(p => p.symbol === hlPos.position.coin);
              if (!local) continue;
              const liveFunding = parseFloat(hlPos.position.cumFunding?.sinceOpen ?? '0');
              if (isFinite(liveFunding) && liveFunding !== local.fundingEarned) {
                usePositionStore.getState().updatePosition(local.id, { fundingEarned: liveFunding });
              }
            }
          }
        } catch { /* non-critical — keep previous values */ }
      }

      // Phase 4.1 / P0-04 / F-04: update hoursHeld per position before passing to engine
      // Use vi.setSystemTime in tests to advance time without real delays.
      const now = Date.now();
      for (const pos of positions) {
        const hoursHeld = Math.floor((now - pos.entryTime) / 3_600_000);
        if (hoursHeld !== pos.hoursHeld) {
          usePositionStore.getState().updatePosition(pos.id, { hoursHeld });
        }
      }
      // Re-read positions after hoursHeld updates so runHarvestCycle sees fresh values
      const positionsWithHours = usePositionStore.getState().positions;

      // Pre-fetch 7d funding history for top 50 candidates (30s poll uses this already in scannerStore)
      // Here we supplement the engine's internal cache for signal computation
      const topCandidates = [...pairs]
        .filter(p => p.currentRate >= config.entryThreshold * 0.8)
        .sort((a, b) => b.currentRate - a.currentRate)
        .slice(0, 50);

      await Promise.allSettled(
        topCandidates.map(async (p) => {
          try {
            const history = await fetchFundingHistory(p.symbol, Date.now() - 168 * 3_600_000, Date.now());
            setHistoryCache(p.symbol, history);
          } catch { /* skip — signal engine sees empty history */ }
        })
      );

      // Compute equity for circuit breaker
      const trades    = usePositionStore.getState().trades;
      const closedNet = trades.reduce((s, t) => s + t.net, 0);
      const openNet   = positions.reduce((s, p) => s + (p.fundingEarned - p.feesPaid), 0);
      const currentEquity = closedNet + openNet;
      const hwm = useEquityCurveStore.getState().highWaterMark;

      // Full round-trip fee fraction for rotation cost (Bug B1 fix)
      const fees = useFeeStore.getState().fees;
      const roundTripFees = fees.perpTaker + fees.spotTaker + fees.perpMaker + fees.spotMaker;

      const accountMarginBuffer = appState.accountMarginBuffer;

      const { actions, logLines } = runHarvestCycle(
        pairs,
        positionsWithHours,
        regime,
        config,
        currentEquity,
        hwm,
        accountMarginBuffer,
        roundTripFees,
      );

      // Append equity curve point
      useEquityCurveStore.getState().append({ timestamp: Date.now(), cumulativeNet: currentEquity });

      const newEntries: HarvestLogEntry[] = logLines.map(l => ({ ...l, id: _logId++ }));
      set(s => ({
        log: [...newEntries, ...s.log].slice(0, 500),
        nextRunAt: Date.now() + 30_000,
      }));

      for (const action of actions) {
        // Use positionsWithHours (updated this cycle) for all lookups inside the action loop
        const currentPositions = positionsWithHours;

        // ── EXIT ──────────────────────────────────────────────────────────────
        if (action.type === 'EXIT') {
          const pos = currentPositions.find(p => p.id === action.positionId);
          if (!wallet.address) continue;

          // Phase 3.2 / RB-01: build signer and close on HL before updating local state
          const getSignerFn = getActiveSigner();
          const hasInjected = !!detectInjectedWallet();

          if (!wallet.canTradeAutonomously && !hasInjected) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'EXIT_FAILED' as const, symbol: action.symbol, message: 'No signer available for exit — skipping (WalletConnect only)' }, ...s.log],
            }));
            continue;
          }

          let exitSigner: import('ethers').Signer;
          try {
            exitSigner = getSignerFn
              ? await getSignerFn()
              : await buildSigner({ mode: 'browser', provider: detectInjectedWallet()! });
          } catch {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'EXIT_FAILED' as const, symbol: action.symbol, message: 'Failed to build signer for exit' }, ...s.log],
            }));
            continue;
          }

          const closeResult = await closeHLPosition({
            symbol: action.symbol,
            address: wallet.address,
            signer: exitSigner,
          });

          if (!closeResult.closed) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'EXIT_FAILED' as const, symbol: action.symbol, message: `Close order for ${action.symbol} did not fill — position left open for retry next cycle` }, ...s.log],
            }));
            continue;
          }

          // Close confirmed (or no live HL exposure — phantom cleanup)
          if (!closeResult.hadLiveExposure) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'INFO' as const, symbol: action.symbol, message: `No live HL position found for ${action.symbol} — closing local tracking entry only (phantom cleanup)` }, ...s.log],
            }));
          }

          usePositionStore.getState().closePosition(action.positionId);
          if (pos) {
            const perpExitFee   = pos.notional * fees.perpTaker;
            const spotExitFee   = pos.notional * fees.spotTaker;
            const totalExitFees = perpExitFee + spotExitFee;
            const totalFees = pos.feesPaid + totalExitFees;
            const net = pos.fundingEarned - totalFees;
            set(s => ({
              totalAutoEarned: s.totalAutoEarned + pos.fundingEarned,
              totalAutoFees:   s.totalAutoFees + totalFees,
            }));
            toast.info(`Exit ${action.symbol} · Net $${net.toFixed(2)}`);
          }
        }

        // ── ENTER ─────────────────────────────────────────────────────────────
        if (action.type === 'ENTER') {
          const pair = pairs.find(p => p.symbol === action.symbol);
          if (!pair) continue;

          if (!wallet.connected || !wallet.address) {
            toast.error('Harvest engine: wallet not connected');
            set(s => ({
              config: { ...s.config, enabled: false },
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ERROR' as const, symbol: action.symbol, message: 'Wallet not connected — harvest engine disabled' }, ...s.log],
            }));
            break;
          }

          // Phase 1.5 / F-02 Layer 1+3: use real canTradeAutonomously, build Signer via registry.
          const getSignerFn = getActiveSigner();
          const hasInjected = !!detectInjectedWallet();

          // Phase 1.6 / RB-05: WalletConnect-only users cannot place autonomous orders.
          if (!wallet.canTradeAutonomously && !hasInjected) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: 'Connected via WalletConnect — cannot place autonomous orders; connect an Agent Key or browser wallet' }, ...s.log],
            }));
            continue;
          }

          if (!getSignerFn && !hasInjected) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: 'No signer available — configure Agent Key or connect browser wallet' }, ...s.log],
            }));
            continue;
          }

          if (!pair.price || pair.price <= 0) {
            toast.error(`No valid price for ${action.symbol} — skipping`);
            continue;
          }

          // Build signer once for this action
          let signer: import('ethers').Signer;
          try {
            if (getSignerFn) {
              signer = await getSignerFn();
            } else {
              const provider = detectInjectedWallet()!;
              signer = await buildSigner({ mode: 'browser', provider });
            }
          } catch (signerErr) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: `Failed to build signer: ${signerErr instanceof Error ? signerErr.message : String(signerErr)}` }, ...s.log],
            }));
            continue;
          }

          // Phase 7 / RB-04 / R-03: sizing via buildPortfolio (replaces flat capitalPerPosition/2)
          const { buildPortfolio, DEFAULT_PORTFOLIO_CONFIG } = await import('../engine/portfolio');
          const portfolioAllocs = buildPortfolio(
            pairs.map(p => ({ ...p, currentRate: p.currentRate, openInterest: p.openInterest })),
            usePositionStore.getState().positions,
            {
              ...DEFAULT_PORTFOLIO_CONFIG,
              // Live balance from wallet (not hardcoded 10k)
              totalCapitalUSDC: appState.wallet.balance || DEFAULT_PORTFOLIO_CONFIG.totalCapitalUSDC,
              maxPositions: config.maxPositions,
            }
          );
          const alloc = portfolioAllocs.enter.find(a => a.symbol === action.symbol);
          if (!alloc) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'SKIP' as const, symbol: action.symbol,
                message: `buildPortfolio returned no allocation for ${action.symbol} — maxPositions or capital cap reached; skipping entry` }, ...s.log],
            }));
            continue;
          }

          // Use portfolio-sized notionals (not flat config.capitalPerPosition/2)
          const perpNotional   = alloc.perpNotional;
          const spotNotional   = alloc.spotNotional;
          const perpEntryFee   = perpNotional * fees.perpMaker;
          const spotEntryFee   = spotNotional * fees.spotMaker;
          const totalEntryFees = perpEntryFee + spotEntryFee;

          const coinSz  = parseFloat((perpNotional / pair.price).toFixed(4));
          const makerPx = pair.price * 0.9995;

          // ── Leg 1: Short perp ──────────────────────────────────────────────
          let perpResult = await placeMarketOrder({
            coin: action.symbol, isBuy: false,
            sz: coinSz, px: makerPx,
            address: wallet.address, signer, tif: 'Alo',
          });

          if (!perpResult.success && perpResult.error?.includes('Would immediately cross')) {
            perpResult = await placeMarketOrder({
              coin: action.symbol, isBuy: false,
              sz: coinSz, px: pair.price * 0.99,
              address: wallet.address, signer, tif: 'Ioc',
            });
          }

          if (!perpResult.success) {
            toast.error(`Perp leg failed for ${action.symbol}: ${perpResult.error}`);
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: `Perp order failed: ${perpResult.error}` }, ...s.log],
            }));
            continue;
          }

          // Phase 2.2: fill confirmation for ENTER
          const perpFilled = await confirmOrderFilled({
            coin: action.symbol,
            orderId: perpResult.orderId,
            address: wallet.address,
            filledAsMaker: perpResult.filledAsMaker,
            signer,
          });

          if (!perpFilled) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: 'Perp order did not fill within timeout, cancelled' }, ...s.log],
            }));
            continue;
          }

          // ── Leg 2: Spot hedge ─────────────────────────────────────────────
          if (config.hedgeMode === 'hl_spot') {
            // Phase 6.1 / P0-02 / F-01: place real spot order automatically
            const spotCoinSz = parseFloat((spotNotional / pair.price).toFixed(4));
            const spotResult = await placeSpotOrder({
              coin: action.symbol, isBuy: true,   // long spot to offset short perp
              sz: spotCoinSz, px: pair.price * 1.0005,
              address: wallet.address, signer, tif: 'Alo',
            });

            if (spotResult.success) {
              // Confirm spot leg fill (same helper as perp)
              const spotFilled = await confirmOrderFilled({
                coin: action.symbol,
                orderId: spotResult.orderId,
                address: wallet.address,
                filledAsMaker: spotResult.filledAsMaker,
                signer,
              });

              if (!spotFilled) {
                // Phase 6.2 / P0-12 / O-07: emergency unwind — cancel perp
                set(s => ({
                  log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: `Spot leg did not fill within timeout — unwinding perp leg automatically` }, ...s.log],
                }));
                await closeHLPosition({ symbol: action.symbol, address: wallet.address, signer });
                toast.error(`${action.symbol}: Spot leg timeout — perp unwound. Entry aborted.`);
                continue;
              }
            } else {
              // Phase 6.2: spot order placement failed — unwind perp immediately
              set(s => ({
                log: [{ id: _logId++, timestamp: Date.now(), type: 'ENTER_FAILED' as const, symbol: action.symbol, message: `Spot leg failed (${spotResult.error}) — perp unwound automatically` }, ...s.log],
              }));
              await closeHLPosition({ symbol: action.symbol, address: wallet.address, signer });
              toast.error(`${action.symbol}: Spot leg failed — perp unwound. Entry aborted.`);
              continue;
            }
          } else if (config.hedgeMode === 'external_spot') {
            toast.info(`${action.symbol}: Perp short entered. Manage spot hedge on your external exchange.`);
          } else {
            toast.warning(`${action.symbol}: PERP ONLY — no hedge placed. Directional exposure is live.`);
          }

          const lf = fees;
          const feeType = perpResult.filledAsMaker ? `maker (${(lf.perpMaker*100).toFixed(4)}%)` : `taker (${(lf.perpTaker*100).toFixed(4)}%)`;
          toast.success(`Harvest entered ${action.symbol} · ${feeType} · OI $${(pair.openInterest / 1e6).toFixed(1)}M`);

          // Phase 2.3 / RB-03: openPosition ONLY after confirmed fill
          usePositionStore.getState().openPosition({
            symbol:        action.symbol,
            entryTime:     Date.now(),
            entryPrice:    pair.price,
            entryRate:     pair.currentRate,
            notional:      perpNotional,
            fundingEarned: 0,
            feesPaid:      totalEntryFees,
            currentPrice:  pair.price,
            currentRate:   pair.currentRate,
            hedgeDrift:    0,
            hoursHeld:     0,
          });
        }

        // ── ROTATE ────────────────────────────────────────────────────────────
        if (action.type === 'ROTATE') {
          const oldPos = currentPositions.find(p => p.id === action.positionId);
          const newPair = pairs.find(p => p.symbol === action.toSymbol);
          if (!newPair || !wallet.address) continue;

          // Build signer for this rotation
          const getSignerFn = getActiveSigner();
          const hasInjected = !!detectInjectedWallet();

          if (!wallet.canTradeAutonomously && !hasInjected) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.fromSymbol, message: 'WalletConnect only — cannot place autonomous orders' }, ...s.log],
            }));
            continue;
          }

          let signer: import('ethers').Signer;
          try {
            signer = getSignerFn
              ? await getSignerFn()
              : await buildSigner({ mode: 'browser', provider: detectInjectedWallet()! });
          } catch {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.fromSymbol, message: 'Failed to build signer for rotation' }, ...s.log],
            }));
            continue;
          }

          // Phase 3.3: close old position on HL first (sequential — safe failure mode)
          const closeResult = await closeHLPosition({
            symbol: action.fromSymbol,
            address: wallet.address,
            signer,
          });

          if (!closeResult.closed) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.fromSymbol, message: `Close order for ${action.fromSymbol} did not fill — rotation aborted, position unchanged` }, ...s.log],
            }));
            continue;
          }

          // Old position confirmed closed — remove local tracking
          if (oldPos) {
            const exitFee   = oldPos.notional * (fees.perpTaker + fees.spotTaker);
            const totalFees = oldPos.feesPaid + exitFee;
            set(s => ({ totalAutoFees: s.totalAutoFees + totalFees }));
          }
          usePositionStore.getState().closePosition(action.positionId);

          // Now attempt new entry
          if (!newPair.price || newPair.price <= 0) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.toSymbol, message: `Rotated out of ${action.fromSymbol}; no valid price for ${action.toSymbol} — capital idle` }, ...s.log],
            }));
            continue;
          }

          // Phase 7: sizing via buildPortfolio for ROTATE new entry (same as ENTER)
          const { buildPortfolio: bpRotate, DEFAULT_PORTFOLIO_CONFIG: dpcRotate } = await import('../engine/portfolio');
          const rotateAllocs = bpRotate(
            pairs.map(p => ({ ...p })),
            usePositionStore.getState().positions,   // old pos already closed at this point
            {
              ...dpcRotate,
              totalCapitalUSDC: appState.wallet.balance || dpcRotate.totalCapitalUSDC,
              maxPositions: config.maxPositions,
            }
          );
          const rotateAlloc = rotateAllocs.enter.find(a => a.symbol === action.toSymbol);
          if (!rotateAlloc) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.toSymbol,
                message: `Rotated out of ${action.fromSymbol}; buildPortfolio returned no allocation for ${action.toSymbol} — capital idle` }, ...s.log],
            }));
            continue;
          }

          const perpNotional   = rotateAlloc.perpNotional;
          const totalEntryFees = perpNotional * (fees.perpMaker + fees.spotMaker);
          const coinSz  = parseFloat((perpNotional / newPair.price).toFixed(4));

          let result = await placeMarketOrder({
            coin: action.toSymbol, isBuy: false, sz: coinSz, px: newPair.price * 0.9995,
            address: wallet.address, signer, tif: 'Alo',
          });
          if (!result.success && result.error?.includes('Would immediately cross')) {
            result = await placeMarketOrder({
              coin: action.toSymbol, isBuy: false, sz: coinSz, px: newPair.price * 0.99,
              address: wallet.address, signer, tif: 'Ioc',
            });
          }

          if (!result.success) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.toSymbol, message: `Rotated out of ${action.fromSymbol}; new entry ${action.toSymbol} failed (${result.error}) — capital idle` }, ...s.log],
            }));
            continue;
          }

          const newFilled = await confirmOrderFilled({
            coin: action.toSymbol,
            orderId: result.orderId,
            address: wallet.address,
            filledAsMaker: result.filledAsMaker,
            signer,
          });

          if (!newFilled) {
            set(s => ({
              log: [{ id: _logId++, timestamp: Date.now(), type: 'ROTATE_FAILED' as const, symbol: action.toSymbol, message: `Rotated out of ${action.fromSymbol}; ${action.toSymbol} did not fill within timeout — capital idle, will retry next cycle` }, ...s.log],
            }));
            continue;
          }

          usePositionStore.getState().openPosition({
            symbol:        action.toSymbol,
            entryTime:     Date.now(),
            entryPrice:    newPair.price,
            entryRate:     newPair.currentRate,
            notional:      perpNotional,
            fundingEarned: 0,
            feesPaid:      totalEntryFees,
            currentPrice:  newPair.price,
            currentRate:   newPair.currentRate,
            hedgeDrift:    0,
            hoursHeld:     0,
          });
          toast.success(`Rotated ${action.fromSymbol} → ${action.toSymbol} · +$${action.gain.toFixed(2)}/day`);
        }

      }

      // ── Phase 6.3 / R-07: Drift rebalancing for hl_spot positions ─────────
      // Only fires for hl_spot mode positions that drifted beyond threshold.
      // Uses computeRebalanceDelta from deltaHedge.ts (zero-referenced until now).
      if (config.hedgeMode === 'hl_spot' && wallet.connected && wallet.address) {
        const getSignerFn = getActiveSigner();
        const hasInjected = !!detectInjectedWallet();
        if (getSignerFn || hasInjected) {
          const currentPositionsForRebalance = usePositionStore.getState().positions;
          for (const pos of currentPositionsForRebalance) {
            const pair = pairs.find(p => p.symbol === pos.symbol);
            if (!pair || !pair.price) continue;

            const { computeRebalanceDelta } = await import('../engine/deltaHedge');

            // Derive current notionals from price drift.
            // Coin size is fixed at entry; as price moves the perp's current-value
            // diverges from the spot leg's original-entry-value, triggering rebalance.
            const coinSz          = pos.entryPrice > 0 ? pos.notional / pos.entryPrice : 0;
            const perpNotionalNow = coinSz * pair.price;       // current mark value
            const spotNotionalNow = pos.notional;              // spot not yet rebalanced

            const delta = computeRebalanceDelta({
              perpNotional: perpNotionalNow,
              spotNotional: spotNotionalNow,
              currentPrice: pair.price,
            });

            const driftPct = pos.entryPrice > 0
              ? Math.abs((pair.price - pos.entryPrice) / pos.entryPrice)
              : 0;

            if (delta.direction !== 'none' && driftPct > config.rebalanceThreshold) {
              try {
                const rebalanceSigner = getSignerFn
                  ? await getSignerFn()
                  : await buildSigner({ mode: 'browser', provider: detectInjectedWallet()! });

                const rebalResult = await placeSpotOrder({
                  coin: pos.symbol,
                  isBuy: delta.direction === 'buy_spot',
                  sz: delta.adjustmentCoins,
                  px: pair.price * (delta.direction === 'buy_spot' ? 1.001 : 0.999),
                  address: wallet.address!,
                  signer: rebalanceSigner,
                  tif: 'Ioc',
                });

                set(s => ({
                  log: [{ id: _logId++, timestamp: Date.now(), type: 'REBALANCE' as const, symbol: pos.symbol,
                    message: rebalResult.success
                      ? `Rebalance ${delta.direction} $${delta.adjustmentUSDC.toFixed(2)} (drift ${(driftPct*100).toFixed(1)}%)`
                      : `Rebalance failed: ${rebalResult.error}` }, ...s.log],
                }));
              } catch { /* non-critical — skip this position's rebalance */ }
            }
          }
        }
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set(s => ({
        log: [{ id: _logId++, timestamp: Date.now(), type: 'ERROR' as const, symbol: '', message: `Cycle error: ${msg}` }, ...s.log],
      }));
    } finally {
      set({ running: false });
    }
  },
}));
