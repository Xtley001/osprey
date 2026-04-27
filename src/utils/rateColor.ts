import type { RateHeat } from '../types/funding';

export const RATE_THRESHOLDS = {
  cold: 0.0002,   // < 0.02%
  warm: 0.0005,   // 0.02–0.05%
  hot:  0.001,    // 0.05–0.10%
  // fire: >= 0.10%
} as const;

export function classifyRate(rate: number): RateHeat {
  if (rate < RATE_THRESHOLDS.cold) return 'cold';
  if (rate < RATE_THRESHOLDS.warm) return 'warm';
  if (rate < RATE_THRESHOLDS.hot)  return 'hot';
  return 'fire';
}

export function rateColor(heat: RateHeat): string {
  switch (heat) {
    case 'cold':  return 'var(--rate-cold)';
    case 'warm':  return 'var(--rate-warm)';
    case 'hot':   return 'var(--rate-hot)';
    case 'fire':  return 'var(--rate-fire)';
  }
}

export function rateEmoji(heat: RateHeat): string {
  switch (heat) {
    case 'cold':  return '🧊';
    case 'warm':  return '☀️';
    case 'hot':   return '🔥';
    case 'fire':  return '🔥';
  }
}
