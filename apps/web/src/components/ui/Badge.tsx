import React from 'react';

export type Tone = 'teal' | 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange' | 'neutral';

interface ToneStyle { bg: string; color: string; border: string; }

// Single palette map so pill/badge tones are consistent everywhere instead of
// re-deriving rgba() triples inline on every call site.
const TONES: Record<Tone, ToneStyle> = {
  teal:    { bg: 'var(--hl-teal-dim)',      color: 'var(--hl-teal)',       border: 'var(--glass-border-hl)' },
  green:   { bg: 'rgba(0,212,160,0.12)',    color: 'var(--accent-green)',  border: 'rgba(0,212,160,0.3)' },
  red:     { bg: 'rgba(255,79,110,0.12)',   color: 'var(--accent-red)',    border: 'rgba(255,79,110,0.3)' },
  yellow:  { bg: 'rgba(245,197,66,0.12)',   color: 'var(--accent-yellow)', border: 'rgba(245,197,66,0.25)' },
  blue:    { bg: 'rgba(91,141,238,0.12)',   color: 'var(--accent-blue)',   border: 'rgba(91,141,238,0.25)' },
  purple:  { bg: 'rgba(155,109,255,0.15)',  color: 'var(--accent-purple)', border: 'rgba(155,109,255,0.25)' },
  orange:  { bg: 'rgba(255,140,66,0.15)',   color: 'var(--accent-orange)', border: 'rgba(255,140,66,0.3)' },
  neutral: { bg: 'rgba(68,71,90,0.3)',      color: 'var(--text-muted)',    border: 'var(--glass-border)' },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', style, children, ...rest }) => {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
        padding: '2px 8px', borderRadius: 'var(--r-sm)',
        background: t.bg, color: t.color, border: `1px solid ${t.border}`,
        fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
};

export default Badge;
