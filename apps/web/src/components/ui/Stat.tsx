import React from 'react';
import { Card } from './Card';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  /** Value color — defaults to primary text. */
  color?: string;
  /** Optional sub-caption under the value. */
  sub?: string;
  /** Value font size. Default 16. */
  size?: number;
  pad?: 'sm' | 'md';
  style?: React.CSSProperties;
}

/**
 * The label/value/sub stat card repeated ~30× across Portfolio, Analytics,
 * and Harvest. One component, one type scale, one source of truth.
 */
export const Stat: React.FC<StatProps> = ({ label, value, color, sub, size = 16, pad = 'md', style }) => (
  <Card pad={pad} style={style}>
    <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
    <p style={{ fontFamily: 'var(--font-mono)', fontSize: size, fontWeight: 600, color: color ?? 'var(--text-primary)' }}>
      {value}
    </p>
    {sub && <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</p>}
  </Card>
);

export default Stat;
