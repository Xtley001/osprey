/**
 * Harvest Engine — pure TypeScript, no React deps.
 *
 * Delta-neutral funding rate harvesting across 20–100 pairs simultaneously.
 * Replaces autotrader.ts — every position opens both a short perp AND a long
 * spot hedge. Without the spot hedge, the position is a naked short and the
 * strategy premise collapses.
 *
 * Called once per rate refresh cycle (every 60s).
 * Returns a list of actions — HarvestService executes them.
 */

import type { FundingRate, FundingEvent } from '../types/funding';
import type { Position } from '../types/position';
import type { HarvestConfig, HarvestLogEntry } from '../types/harvest';
import type { RegimeState } from '../types/account';
import { shouldRotate } from './regime';
import { computeSignal } from './signals';
import { RATE_TIERS } from '../utils/constants';

export type HarvestAction =
  | { type: 'ENTER';  symbol: string; reason: string; rate: number }
  | { type: 'EXIT';   positionId: string; symbol: string; reason: string }
  | { type: 'ROTATE'; positionId: string; fromSymbol: string; toSymbol: string; reason: string; gain: number }
  | { type: 'SKIP';   symbol: string; reason: string };

export interface HarvestDecision {
  actions:  HarvestAction[];
  logLines: Omit<HarvestLogEntry, 'id'>[];
}

// Legacy alias so existing callers using AutoTraderDecision still compile
export type AutoTraderDecision = HarvestDecision;

let _historyCache: Map<string, FundingEvent[]> = new Map();

export function setHistoryCache(symbol: string, history: FundingEvent[]) {
  _historyCache.set(symbol, history);
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export function runHarvestCycle(
  pairs:       FundingRate[],
  positions:   Position[],
  regime:      RegimeState,
  config:      HarvestConfig,
): HarvestDecision {
  const actions:  HarvestAction[]                       = [];
  const logLines: Omit<HarvestLogEntry, 'id'>[]         = [];
  const now = Date.now();

  const log = (
    type:    HarvestLogEntry['type'],
    symbol:  string,
    message: string,
    rate?:   number,
    pnl?:    number
  ) => {
    logLines.push({ timestamp: now, type, symbol, message, rate, pnl });
  };

  // ── 1. Immediate exits: negative rates (you pay instead of receive) ─────────
  checkNegativeRateExits(positions, pairs, actions, log);

  // ── 2. Regime gate ──────────────────────────────────────────────────────────
  if (config.regimeGate && regime.label === 'COLD') {
    log('INFO', '', 'Regime COLD — new entries paused. Monitoring existing positions.');
    checkExits(positions, pairs, config, actions, log);
    return { actions, logLines };
  }

  // ── 3. Standard exits ───────────────────────────────────────────────────────
  checkExits(positions, pairs, config, actions, log);

  // ── 4. Rotations ────────────────────────────────────────────────────────────
  if (config.rotationEnabled) {
    checkRotations(positions, pairs, config, actions, log);
  }

  // ── 5. New entries — up to maxPositions (was hardcoded 3, now 100) ──────────
  const activeSymbols = new Set(positions.map(p => p.symbol));
  const slotsAvailable = config.maxPositions - positions.length;

  if (slotsAvailable > 0) {
    checkEntries(pairs, activeSymbols, slotsAvailable, config, actions, log);
  } else {
    log('INFO', '', `All ${config.maxPositions} position slots active — scanning for rotation opportunities`);
  }

  return { actions, logLines };
}


// ── Immediate exit: negative funding ─────────────────────────────────────────
function checkNegativeRateExits(
  positions: Position[],
  pairs:     FundingRate[],
  actions:   HarvestAction[],
  log:       (type: HarvestLogEntry['type'], symbol: string, msg: string, rate?: number, pnl?: number) => void
) {
  for (const pos of positions) {
    const live = pairs.find(p => p.symbol === pos.symbol);
    const currentRate = live?.currentRate ?? pos.currentRate;
    if (currentRate < 0) {
      actions.push({
        type: 'EXIT',
        positionId: pos.id,
        symbol: pos.symbol,
        reason: `NEGATIVE RATE — ${(currentRate * 100).toFixed(4)}%/hr. Exiting immediately to protect capital.`,
      });
      log('EXIT', pos.symbol,
        `⚠ Negative rate ${(currentRate * 100).toFixed(4)}%/hr — emergency exit`,
        currentRate,
        pos.fundingEarned - pos.feesPaid
      );
    }
  }
}

// ── Standard exit checks ─────────────────────────────────────────────────────
function checkExits(
  positions: Position[],
  pairs:     FundingRate[],
  config:    HarvestConfig,
  actions:   HarvestAction[],
  log:       (type: HarvestLogEntry['type'], symbol: string, msg: string, rate?: number, pnl?: number) => void
) {
  for (const pos of positions) {
    // Skip positions already queued for exit
    if (actions.some(a => a.type === 'EXIT' && a.positionId === pos.id)) continue;

    const live = pairs.find(p => p.symbol === pos.symbol);
    const currentRate = live?.currentRate ?? pos.currentRate;
    const net = pos.fundingEarned - pos.feesPaid;

    if (currentRate < config.exitThreshold) {
      actions.push({
        type: 'EXIT',
        positionId: pos.id,
        symbol: pos.symbol,
        reason: `Rate ${(currentRate * 100).toFixed(4)}%/hr below exit floor ${(config.exitThreshold * 100).toFixed(4)}%/hr`,
      });
      log('EXIT', pos.symbol,
        `Exiting — rate ${(currentRate * 100).toFixed(4)}%/hr below floor. Net: $${net.toFixed(2)}`,
        currentRate, net
      );
      continue;
    }

    if (pos.hoursHeld >= config.maxHoldHours) {
      actions.push({
        type: 'EXIT',
        positionId: pos.id,
        symbol: pos.symbol,
        reason: `Max hold ${config.maxHoldHours}h reached`,
      });
      log('EXIT', pos.symbol,
        `Exiting — max hold ${config.maxHoldHours}h reached. Net: $${net.toFixed(2)}`,
        currentRate, net
      );
    }
  }
}

// ── Rotation checks ───────────────────────────────────────────────────────────
function checkRotations(
  positions: Position[],
  pairs:     FundingRate[],
  config:    HarvestConfig,
  actions:   HarvestAction[],
  log:       (type: HarvestLogEntry['type'], symbol: string, msg: string, rate?: number, pnl?: number) => void
) {
  const heldSymbols = new Set(positions.map(p => p.symbol));
  const bestPair = [...pairs]
    .filter(p => !heldSymbols.has(p.symbol) && p.openInterest >= config.minOI && p.currentRate >= 0)
    .sort((a, b) => b.currentRate - a.currentRate)[0];

  if (!bestPair) return;

  for (const pos of positions) {
    if (actions.some(a => (a.type === 'EXIT' || a.type === 'ROTATE') && 'positionId' in a && a.positionId === pos.id)) continue;

    const currentRate = pairs.find(p => p.symbol === pos.symbol)?.currentRate ?? pos.currentRate;
    const { rotate, breakEvenHours, gain } = shouldRotate(
      currentRate,
      bestPair.currentRate,
      pos.notional,
      config.rotationAdvantage,
      config.rotationAdvantage,
      3
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
      break; // one rotation per cycle
    }
  }
}

// ── Entry checks ──────────────────────────────────────────────────────────────
// Entry threshold lowered from 0.04%/hr to 0.005%/hr.
// This captures the persistent steady-state yield that spike-chasing misses.
function checkEntries(
  pairs:          FundingRate[],
  activeSymbols:  Set<string>,
  slotsAvailable: number,
  config:         HarvestConfig,
  actions:        HarvestAction[],
  log:            (type: HarvestLogEntry['type'], symbol: string, msg: string, rate?: number, pnl?: number) => void
) {
  const candidates = [...pairs]
    .filter(p =>
      !activeSymbols.has(p.symbol) &&
      p.openInterest >= config.minOI &&
      p.currentRate >= config.entryThreshold &&
      p.currentRate >= 0   // never enter negative rates
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
      // Classify tier for logging
      const tierLabel =
        pair.currentRate >= RATE_TIERS.hot      ? '🔥 HOT' :
        pair.currentRate >= RATE_TIERS.elevated  ? '📈 ELEVATED' : '✅ CORE';

      actions.push({ type: 'ENTER', symbol: pair.symbol, reason: signal.reason, rate: pair.currentRate });
      log('ENTRY', pair.symbol,
        `Entering [${tierLabel}] — ${signal.reason} (${(pair.currentRate * 100).toFixed(4)}%/hr, OI $${(pair.openInterest / 1e6).toFixed(1)}M)`,
        pair.currentRate
      );
      entered++;
    } else {
      log('SKIP', pair.symbol, `Skip — ${signal.reason}`, pair.currentRate);
    }
  }

  if (entered === 0 && candidates.length === 0) {
    log('INFO', '', `No pairs above ${(config.entryThreshold * 100).toFixed(4)}%/hr entry threshold with sufficient liquidity`);
  }
}
