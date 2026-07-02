import React from 'react';

export interface SectionLabelProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

/**
 * The small uppercase muted section heading used above tables and card groups
 * (e.g. "STRATEGY HEALTH", "OPEN POSITIONS", "ACTIVITY LOG"). Was re-declared
 * inline with the same 6 style props on ~15 call sites.
 */
export const SectionLabel: React.FC<SectionLabelProps> = ({ style, children, ...rest }) => (
  <p
    style={{
      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)',
      ...style,
    }}
    {...rest}
  >
    {children}
  </p>
);

export default SectionLabel;
