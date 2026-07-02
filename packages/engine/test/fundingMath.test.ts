import { describe, it, expect } from 'vitest';
import { classifyRate, rateColor, RATE_THRESHOLDS } from '../src/utils/rateColor';
import { formatUSD, formatRate, formatPct, formatDuration, formatRateRaw } from '../src/utils/format';

// ─── classifyRate ─────────────────────────────────────────────────────────────
describe('classifyRate', () => {
  it('returns cold for zero rate', () => {
    expect(classifyRate(0)).toBe('cold');
  });

  it('returns cold for rate below cold threshold', () => {
    expect(classifyRate(0.0001)).toBe('cold');
  });

  it('returns warm at exactly cold threshold', () => {
    expect(classifyRate(RATE_THRESHOLDS.cold)).toBe('warm');
  });

  it('returns warm in the warm band', () => {
    expect(classifyRate(0.0003)).toBe('warm');
  });

  it('returns hot in the hot band', () => {
    expect(classifyRate(0.0006)).toBe('hot');
  });

  it('returns fire at and above fire threshold', () => {
    expect(classifyRate(0.001)).toBe('fire');
    expect(classifyRate(0.005)).toBe('fire');
  });

  it('handles negative rates as cold', () => {
    expect(classifyRate(-0.001)).toBe('cold');
  });
});

// ─── rateColor ────────────────────────────────────────────────────────────────
describe('rateColor', () => {
  it('returns a CSS variable string for each heat level', () => {
    expect(rateColor('cold')).toMatch(/var\(--/);
    expect(rateColor('warm')).toMatch(/var\(--/);
    expect(rateColor('hot')).toMatch(/var\(--/);
    expect(rateColor('fire')).toMatch(/var\(--/);
  });

  it('returns different colors for different heat levels', () => {
    const colors = new Set(['cold', 'warm', 'hot', 'fire'].map(h => rateColor(h as any)));
    expect(colors.size).toBe(4);
  });
});

// ─── formatUSD ───────────────────────────────────────────────────────────────
describe('formatUSD', () => {
  it('formats values under 1000 with 2 decimals', () => {
    expect(formatUSD(42.5)).toBe('$42.50');
    expect(formatUSD(0)).toBe('$0.00');
  });

  it('formats thousands with K suffix', () => {
    expect(formatUSD(1500)).toBe('$1.5K');
    expect(formatUSD(10000)).toBe('$10.0K');
  });

  it('formats millions with M suffix', () => {
    expect(formatUSD(1_250_000)).toBe('$1.25M');
  });

  it('handles negative values', () => {
    expect(formatUSD(-500)).toBe('-$500.00');
    expect(formatUSD(-2000)).toBe('-$2.0K');
  });
});

// ─── formatRate ──────────────────────────────────────────────────────────────
describe('formatRate', () => {
  it('shows + sign for positive rates', () => {
    expect(formatRate(0.0005)).toContain('+');
  });

  it('shows - sign for negative rates', () => {
    expect(formatRate(-0.0005)).toContain('-');
  });

  it('converts decimal to percentage', () => {
    expect(formatRate(0.001)).toContain('0.1000');
  });
});

describe('formatRateRaw', () => {
  it('does not show + prefix', () => {
    expect(formatRateRaw(0.001).startsWith('+')).toBe(false);
  });

  it('shows 4 decimal places', () => {
    expect(formatRateRaw(0.001)).toBe('0.1000%');
  });
});

// ─── formatPct ───────────────────────────────────────────────────────────────
describe('formatPct', () => {
  it('adds + for positive values', () => {
    expect(formatPct(5)).toBe('+5.00%');
  });

  it('shows negative correctly', () => {
    expect(formatPct(-2.5)).toBe('-2.50%');
  });

  it('respects custom decimal places', () => {
    expect(formatPct(1.23456, 1)).toBe('+1.2%');
  });
});

// ─── formatDuration ──────────────────────────────────────────────────────────
describe('formatDuration', () => {
  it('shows minutes for sub-hour durations', () => {
    expect(formatDuration(0.5)).toContain('m');
  });

  it('shows hours for 1–24h range', () => {
    expect(formatDuration(6)).toContain('h');
  });

  it('shows days for >24h', () => {
    expect(formatDuration(48)).toContain('d');
  });
});
