import React from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size    = 'sm' | 'md';

const SIZE: Record<Size, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 12 },
  md: { padding: 'var(--sp-2) var(--sp-4)', fontSize: 12 },
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * Button primitive over the existing `.btn` CSS classes so every call site
 * stops re-specifying padding/font inline. `style` still overrides for edge cases.
 */
export const Button: React.FC<ButtonProps> = ({ variant = 'ghost', size = 'sm', className, style, children, ...rest }) => (
  <button
    className={`btn btn-${variant}${className ? ' ' + className : ''}`}
    style={{ ...SIZE[size], ...style }}
    {...rest}
  >
    {children}
  </button>
);

export default Button;
