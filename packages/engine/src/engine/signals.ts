/**
 * Signal computation — Phase 2 aggressive entry logic.
 * WAIT gate removed per CALC_AUDIT.md §8.2 (Bug B3 fixed).
 * If rate >= entryThreshold, label is ENTER immediately.
 * persistenceHours is computed for display/analytics but does NOT gate entry.
 */

import type { FundingEvent } from '../types/funding';

export type SignalLabel = 'ENTER' | 'WAIT' | 'EXIT' | 'AVOID';

export interface EntrySignal {
  label:            SignalLabel;
  reason:           string;
  confidence:       number;
  persistenceHours: number;  // consecutive hours above entryThreshold (display only)
}

export function computeSignal(
  currentRate:    number,
  history:        FundingEvent[],
  entryThreshold: number,
  exitThreshold:  number,
): EntrySignal {
  // Hard AVOID: never enter negative rates (paying funding, not receiving)
  if (currentRate < 0) {
    return {
      label: 'AVOID',
      reason: 'Negative rate — paying funding, not receiving. Never enter.',
      confidence: 99,
      persistenceHours: 0,
    };
  }

  // Hard AVOID: below exit floor — not worth deploying capital
  if (currentRate < exitThreshold) {
    return {
      label: 'AVOID',
      reason: 'Rate below exit threshold — capital unproductive here',
      confidence: 85,
      persistenceHours: 0,
    };
  }

  // Compute persistence: consecutive hours above threshold from most recent backward
  // MUST be consecutive — first gap stops the count.
  // Used for display and confidence scoring ONLY — does not gate entry.
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  let persistenceHours = 0;
  for (const event of sorted) {
    if (event.rate >= entryThreshold) persistenceHours++;
    else break;  // first gap resets
  }

  // ENTER immediately if rate is above threshold — no confirmation window
  // See CALC_AUDIT.md §8.2 — every hour of delay is funding not collected
  if (currentRate >= entryThreshold) {
    return {
      label: 'ENTER',
      reason: `Rate ${(currentRate * 100).toFixed(4)}%/hr — entering. Persistence: ${persistenceHours}h above threshold`,
      confidence: Math.min(95, 50 + persistenceHours * 5),
      persistenceHours,
    };
  }

  // Rate is between exitThreshold and entryThreshold — watching
  return {
    label: 'WAIT',
    reason: `Rate ${(currentRate * 100).toFixed(4)}%/hr — approaching threshold (${(entryThreshold * 100).toFixed(4)}%/hr)`,
    confidence: 30,
    persistenceHours,
  };
}
