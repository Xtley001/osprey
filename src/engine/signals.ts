import type { FundingEvent } from '../types/funding';

export type SignalLabel = 'ENTER' | 'WAIT' | 'EXIT' | 'AVOID';

export interface EntrySignal {
  label: SignalLabel;
  reason: string;
  confidence: number;
}

export function computeSignal(
  currentRate: number,
  history: FundingEvent[],
  entryThreshold: number,
  exitThreshold: number
): EntrySignal {
  if (currentRate < 0) {
    return { label: 'AVOID', reason: 'Negative rate — longs are being paid, avoid short perp', confidence: 90 };
  }

  if (currentRate < exitThreshold) {
    return { label: 'AVOID', reason: 'Rate below exit threshold — not worth deploying capital', confidence: 80 };
  }

  // Check consecutive hours above threshold
  const recent = [...history].sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);
  const elevatedCount = recent.filter(e => e.rate >= entryThreshold).length;

  if (currentRate >= entryThreshold && elevatedCount >= 2) {
    return {
      label: 'ENTER',
      reason: `Rate ${(currentRate * 100).toFixed(4)}%/hr — elevated for ${elevatedCount}+ consecutive hours`,
      confidence: Math.min(95, 60 + elevatedCount * 10),
    };
  }

  if (currentRate >= entryThreshold && elevatedCount < 2) {
    return {
      label: 'WAIT',
      reason: `Rate above threshold but only elevated for ${elevatedCount}h — wait for confirmation`,
      confidence: 55,
    };
  }

  // In trade, check exit
  const recentDrop = recent.slice(0, 2).every(e => e.rate < exitThreshold);
  if (recentDrop) {
    return {
      label: 'EXIT',
      reason: 'Rate has fallen below exit threshold for 2+ hours',
      confidence: 85,
    };
  }

  return { label: 'WAIT', reason: 'Rate rising — watching for threshold confirmation', confidence: 40 };
}
