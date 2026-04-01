/**
 * AutoTrader Engine — pure TypeScript, no React deps.
 *
 * This function is called once per rate refresh cycle (every 60s).
 * It decides what to do with the current set of positions and open opportunities.
 * It returns a list of actions — the caller (AutoTraderService) executes them.
 */

import type { FundingRate, FundingEvent } from '../types/funding';
import type { Position } from '../types/position';
import type { AutoTraderConfig, AutoTraderLogEntry } from '../types/autotrader';
import type { RegimeState } from '../types/account';
import { shouldRotate } from './regime';
import { computeSignal } from './signals';

export type AutoAction =
  | { type: 'ENTER';  symbol: string; reason: string; rate: number }
  | { type: 'EXIT';   positionId: string; symbol: string; reason: string }
  | { type: 'ROTATE'; positionId: string; fromSymbol: string; toSymbol: string; reason: string; gain: number }
  | { type: 'SKIP';   symbol: string; reason: string };

export interface AutoTraderDecision {
  actions:  AutoAction[];
  logLines: Omit<AutoTraderLogEntry, 'id'>[];
}

let _historyCache: Map<string, FundingEvent[]> = new Map();

export function setHistoryCache(symbol: string, history: FundingEvent[]) {
  _historyCache.set(symbol, history);
}

export function runAutoTraderCycle(
  pairs:       FundingRate[],
  positions:   Position[],
  regime:      RegimeState,
  config:      AutoTraderConfig,
): AutoTraderDecision {
  const actions:  AutoAction[]                        = [];
  const logLines: Omit<AutoTraderLogEntry, 'id'>[]   = [];
  const now = Date.now();

  const log = (
    type:    AutoTraderLogEntry['type'],
    symbol:  string,
    message: string,
    rate?:   number,
    pnl?:    number
  ) => {
    logLines.push({ timestamp: now, type, symbol, message, rate, pnl });
  };

  // ── 1. Regime gate ─────────────────────────────────────────────────────────
  if (config.regimeGate && regime.label === 'COLD') {
    log('INFO', '', `Regime COLD — auto-trader paused. No new entries.`);
    // Still check exits on existing positions
    checkExits(positions, pairs, config, actions, log);
    return { actions, logLines };
  }

  // ── 2. Check exits on existing positions ──────────────────────────────────
  checkExits(positions, pairs, config, actions, log);

  // ── 3. Check rotations on existing positions ──────────────────────────────
  if (config.rotationEnabled) {
    checkRotations(positions, pairs, config, actions, log);
  }

  // ── 4. Check new entries ───────────────────────────────────────────────────
  const activeSymbols = new Set(positions.map(p => p.symbol));
  const currentPositionCount = positions.length;

  if (currentPositionCount < config.maxPositions) {
    const slotsAvailable = config.maxPositions - currentPositionCount;
    checkEntries(pairs, activeSymbols, slotsAvailable, config, actions, log);
  } else {
    log('INFO', '', `Max positions (${config.maxPositions}) reached — not entering new trades`);
  }

  return { actions, logLines };
}

function checkExits(
  positions:  Position[],
  pairs:      FundingRate[],
  config:     AutoTraderConfig,
  actions:    AutoAction[],
  log:        (type: AutoTraderLogEntry['type'], symbol: string, message: string, rate?: number, pnl?: number) => void
) {
  for (const pos of positions) {
    const live = pairs.find(p => p.symbol === pos.symbol);
    const currentRate = live?.currentRate ?? pos.currentRate;
    const hoursHeld   = pos.hoursHeld;
    const net         = pos.fundingEarned - pos.feesPaid;

    // Exit: rate dropped below threshold
    if (currentRate < config.exitThreshold) {
      actions.push({
        type: 'EXIT',
        positionId: pos.id,
        symbol: pos.symbol,
        reason: `Rate ${(currentRate * 100).toFixed(4)}% dropped below exit threshold ${(config.exitThreshold * 100).toFixed(4)}%`,
      });
      log('EXIT', pos.symbol,
        `Exiting — rate ${(currentRate * 100).toFixed(4)}%/hr below threshold. Net: $${net.toFixed(2)}`,
        currentRate, net
      );
      continue;
    }

    // Exit: max hold time reached
    if (hoursHeld >= config.maxHoldHours) {
      actions.push({
        type: 'EXIT',
        positionId: pos.id,
        symbol: pos.symbol,
        reason: `Max hold time ${config.maxHoldHours}h reached`,
      });
      log('EXIT', pos.symbol,
        `Exiting — max hold time ${config.maxHoldHours}h reached. Net: $${net.toFixed(2)}`,
        currentRate, net
      );
    }
  }
}

function checkRotations(
  positions:  Position[],
  pairs:      FundingRate[],
  config:     AutoTraderConfig,
  actions:    AutoAction[],
  log:        (type: AutoTraderLogEntry['type'], symbol: string, message: string, rate?: number, pnl?: number) => void
) {
  // Find best available pair not already held
  const heldSymbols = new Set(positions.map(p => p.symbol));
  const bestPair = [...pairs]
    .filter(p => !heldSymbols.has(p.symbol) && p.openInterest >= config.minOI)
    .sort((a, b) => b.currentRate - a.currentRate)[0];

  if (!bestPair) return;

  // Check each position to see if rotating to bestPair is profitable
  for (const pos of positions) {
    // Skip positions that are already queued for exit
    const alreadyExiting = false; // simplified — in real impl track pending exits
    if (alreadyExiting) continue;

    const currentRate = pairs.find(p => p.symbol === pos.symbol)?.currentRate ?? pos.currentRate;

    const { rotate, breakEvenHours, gain } = shouldRotate(
      currentRate,
      bestPair.currentRate,
      pos.notional,
      config.rotationAdvantage,   // using rotationAdvantage as min advantage
      config.rotationAdvantage,
      3  // max break-even hours
    );

    if (rotate) {
      actions.push({
        type: 'ROTATE',
        positionId: pos.id,
        fromSymbol: pos.symbol,
        toSymbol:   bestPair.symbol,
        reason: `${bestPair.symbol} pays ${((bestPair.currentRate - currentRate) * 100).toFixed(4)}%/hr more. Break-even in ${breakEvenHours.toFixed(1)}h`,
        gain,
      });
      log('ROTATE', pos.symbol,
        `Rotating ${pos.symbol} → ${bestPair.symbol}. Rate gain: ${((bestPair.currentRate - currentRate) * 100).toFixed(4)}%/hr. Est. daily gain: $${gain.toFixed(2)}`,
        bestPair.currentRate
      );
      // Only rotate one position per cycle to avoid excessive churn
      break;
    }
  }
}

function checkEntries(
  pairs:           FundingRate[],
  activeSymbols:   Set<string>,
  slotsAvailable:  number,
  config:          AutoTraderConfig,
  actions:         AutoAction[],
  log:             (type: AutoTraderLogEntry['type'], symbol: string, message: string, rate?: number, pnl?: number) => void
) {
  // Sort by rate descending, filter by liquidity, skip held
  const candidates = [...pairs]
    .filter(p =>
      !activeSymbols.has(p.symbol) &&
      p.openInterest >= config.minOI &&
      p.currentRate >= config.entryThreshold
    )
    .sort((a, b) => b.currentRate - a.currentRate);

  let entered = 0;
  for (const pair of candidates) {
    if (entered >= slotsAvailable) break;

    const history = _historyCache.get(pair.symbol) ?? [];
    const signal  = computeSignal(
      pair.currentRate,
      history,
      config.entryThreshold,
      config.exitThreshold
    );

    if (signal.label === 'ENTER') {
      actions.push({
        type:   'ENTER',
        symbol: pair.symbol,
        reason: signal.reason,
        rate:   pair.currentRate,
      });
      log('ENTRY', pair.symbol,
        `Entering — ${signal.reason} (${(pair.currentRate * 100).toFixed(4)}%/hr, OI $${(pair.openInterest / 1e6).toFixed(1)}M)`,
        pair.currentRate
      );
      entered++;
    } else {
      log('SKIP', pair.symbol,
        `Skip — ${signal.reason}`,
        pair.currentRate
      );
    }
  }

  if (entered === 0 && candidates.length === 0) {
    log('INFO', '', 'No pairs above entry threshold with sufficient liquidity');
  }
}
