import React from 'react';

type Pad = 'none' | 'sm' | 'md' | 'lg';

const PAD: Record<Pad, string | number> = {
  none: 0,
  sm:   'var(--sp-3)',
  md:   'var(--sp-4)',
  lg:   'var(--sp-5)',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Padding preset. Default 'md'. */
  pad?: Pad;
  /** Adds the teal highlight border/glow. */
  highlighted?: boolean;
}

/**
 * Glass surface primitive — replaces the repeated
 * `<div className="glass-card" style={{ padding: 'var(--sp-4)' }}>` idiom.
 * Extra styles still pass through via `style` for one-off cases.
 */
export const Card: React.FC<CardProps> = ({ pad = 'md', highlighted, className, style, children, ...rest }) => (
  <div
    className={`glass-card${highlighted ? ' highlighted' : ''}${className ? ' ' + className : ''}`}
    style={{ padding: PAD[pad], ...style }}
    {...rest}
  >
    {children}
  </div>
);

export default Card;
