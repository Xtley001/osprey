/**
 * Harvest Engine — pure TypeScript, no React deps.
 * Phase 2: circuit breaker, per-pair loss limit, liquidation buffer.
 * All entries are aggressive — no WAIT gate (Bug B3 fixed in signals.ts).
 *
 * Called once per rate refresh cycle (every 30s).
 * Returns a list of actions — HarvestStore executes them.
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

// Legacy alias
export type AutoTraderDecision = HarvestDecision;

const _historyCache: Map<string, FundingEvent[]> = new Map();

export function setHistoryCache(symbol: string, history: FundingEvent[]) {
  _historyCache.set(symbol, history);
}

type LogFn = (
  type:    HarvestLogEntry['type'],
  symbol:  string,
  message: string,
  rate?:   number,
  pnl?:    number
) => void;

// ── Main cycle ────────────────────────────────────────────────────────────────

export function runHarvestCycle(
  pairs:                FundingRate[],
  positions:            Position[],
  regime:               RegimeState,
  config:               HarvestConfig,
  currentEquity:        number,
  highWaterMark:        number,
  accountMarginBuffer?: number,   // % of account equity available; from HL API
  roundTripFees?:       number,   // sum of all 4 leg fee fractions
): HarvestDecision {
  const actions:  HarvestAction[]               = [];
  const logLines: Omit<HarvestLogEntry, 'id'>[] = [];
  const now = Date.now();

  const log: LogFn = (type, symbol, message, rate, pnl) => {
    logLines.push({ timestamp: now, type, symbol, message, rate, pnl });
  };

  // ── 1. Immediate exits: negative rates ──────────────────────────────────────
  checkNegativeRateExits(positions, pairs, actions, log);

  // ── 2. Regime gate ──────────────────────────────────────────────────────────
  if (config.regimeGate && regime.label === 'COLD') {
    log('INFO', '', 'Regime COLD — new entries paused. Monitoring existing positions.');
    checkExits(positions, pairs, config, actions, log);
    return { actions, logLines };
  }

  // ── 3. Standard exits ───────────────────────────────────────────────────────
  checkExits(positions, pairs, config, actions, log);

  // ── 4. Circuit breaker — runs AFTER exits so today's exits reduce drawdown ──
  const circuitTripped = checkCircuitBreaker(currentEquity, highWaterMark, config, log);

  // ── 5. Rotations — allowed even when circuit is tripped ─────────────────────
  if (config.rotationEnabled) {
    checkRotations(positions, pairs, config, actions, log, roundTripFees ?? 0);
  }

  // ── 6. New entries — blocked when circuit is tripped ────────────────────────
  const activeSymbols  = new Set(positions.map(p => p.symbol));
  const slotsAvailable = config.maxPositions - positions.length;

  if (!circuitTripped && slotsAvailable > 0) {
    checkEntries(pairs, activeSymbols, slotsAvailable, config, actions, log, accountMarginBuffer);
  } else if (circuitTripped) {
    log('INFO', '', `Circuit breaker active — entries blocked. Drawdown exceeds ${config.maxDrawdownPct}% from peak.`);
  } else {
    log('INFO', '', `All ${config.maxPositions} position slots active — scanning for rotation opportunities`);
  }

  return { actions, logLines };
}

// ── Circuit breaker ───────────────────────────────────────────────────────────
function checkCircuitBreaker(
  currentEquity: number,
  hwm:           number,
  config:        HarvestConfig,
  log:           LogFn,
): boolean {
  if (config.maxDrawdownPct <= 0) return false;   // disabled
  if (hwm <= 0)                   return false;   // no baseline — engine hasn't earned anything yet
  const drawdownPct = ((hwm - currentEquity) / hwm) * 100;
  if (drawdownPct >= config.maxDrawdownPct) {
    log('ERROR', '',
      `⛔ Circuit breaker: drawdown ${drawdownPct.toFixed(1)}% ≥ limit ${config.maxDrawdownPct}%. New entries paused.`
    );
    return true;
  }
  return false;
}

// ── Immediate exit: negative funding ─────────────────────────────────────────
function checkNegativeRateExits(
  positions: Position[],
  pairs:     FundingRate[],
  actions:   HarvestAction[],
  log:       LogFn,
) {
  for (const pos of positions) {
    const live = pairs.find(p => p.symbol === pos.symbol);
    const currentRate = live?.currentRate ?? pos.currentRate;
    if (currentRate < 0) {
      actions.push({
        type: 'EXIT',
        positionId: pos.id,
        symbol: pos.symbol,
        reason: `NEGATIVE RATE — ${(currentRate * 100).toFixed(4)}%/hr. Exiting immediately.`,
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
  log:       LogFn,
) {
  for (const pos of positions) {
    if (actions.some(a => a.type === 'EXIT' && a.positionId === pos.id)) continue;

    const live = pairs.find(p => p.symbol === pos.symbol);
    const currentRate = live?.currentRate ?? pos.currentRate;
    const net = pos.fundingEarned - pos.feesPaid;

    // Rate below exit floor
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

    // Max hold time
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
      continue;
    }

    // Per-pair loss limit — see CALC_AUDIT.md §6.2
    // pos.notional = perp notional = capital/2 (the earning leg)
    if (config.maxPairLossPct > 0) {
      const unrealizedLoss = pos.feesPaid - pos.fundingEarned;  // positive = net loss
      const lossThreshold  = pos.notional * (config.maxPairLossPct / 100);
      if (unrealizedLoss > lossThreshold) {
        actions.push({
          type: 'EXIT',
          positionId: pos.id,
          symbol: pos.symbol,
          reason: `Per-pair loss limit: -$${unrealizedLoss.toFixed(2)} exceeds ${config.maxPairLossPct}% of $${pos.notional.toFixed(0)} notional`,
        });
        log('EXIT', pos.symbol,
          `⚠ Loss limit hit: -$${unrealizedLoss.toFixed(2)} on $${pos.notional.toFixed(0)} notional`,
          currentRate,
          -unrealizedLoss
        );
        continue;
      }
    }
  }
}

// ── Rotation checks ───────────────────────────────────────────────────────────
function checkRotations(
  positions:     Position[],
  pairs:         FundingRate[],
  config:        HarvestConfig,
  actions:       HarvestAction[],
  log:           LogFn,
  roundTripFees: number,   // full round-trip fee fraction — see CALC_AUDIT.md §4.1
) {
  const heldSymbols = new Set(positions.map(p => p.symbol));
  const bestPair = [...pairs]
    .filter(p => !heldSymbols.has(p.symbol) && p.openInterest >= config.minOI && p.currentRate >= 0)
    .sort((a, b) => b.currentRate - a.currentRate)[0];

  if (!bestPair) return;

  for (const pos of positions) {
    if (actions.some(a => (a.type === 'EXIT' || a.type === 'ROTATE') && 'positionId' in a && a.positionId === pos.id)) continue;

    const currentRate = pairs.find(p => p.symbol === pos.symbol)?.currentRate ?? pos.currentRate;

    // Fixed: pass roundTripFees (not rotationAdvantage), use 2h break-even max (not 3)
    const { rotate, breakEvenHours, gain } = shouldRotate(
      currentRate,
      bestPair.currentRate,
      pos.notional,
      roundTripFees,           // ← correct fee param (fixes Bug B1)
      config.rotationAdvantage,
      2.0                      // ← aggressive 2h break-even (Phase 2)
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
function checkEntries(
  pairs:               FundingRate[],
  activeSymbols:       Set<string>,
  slotsAvailable:      number,
  config:              HarvestConfig,
  actions:             HarvestAction[],
  log:                 LogFn,
  accountMarginBuffer?: number,
) {
  // Liquidation buffer pre-check — see CALC_AUDIT.md §6.3
  if (config.liquidationBufferPct > 0 && accountMarginBuffer !== undefined && accountMarginBuffer < config.liquidationBufferPct) {
    log('INFO', '', `Entries paused — margin buffer ${accountMarginBuffer.toFixed(1)}% below ${config.liquidationBufferPct}% minimum.`);
    return;
  }

  const candidates = [...pairs]
    .filter(p =>
      !activeSymbols.has(p.symbol) &&
      p.openInterest >= config.minOI &&
      p.currentRate >= config.entryThreshold &&
      p.currentRate >= 0
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
