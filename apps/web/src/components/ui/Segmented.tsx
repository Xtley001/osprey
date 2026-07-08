import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * Segmented control — the pill-tab selector for category filters and timeframe
 * pickers. Replaces the hand-rolled chip rows in Scanner / Analytics.
 */
export function Segmented<T extends string>({ options, value, onChange, style, ...aria }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="tablist" style={style} {...aria}>
      {options.map(opt => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          data-active={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
