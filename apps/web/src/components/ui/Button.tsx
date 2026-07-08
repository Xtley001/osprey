import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button; width stays locked (no reflow). */
  loading?: boolean;
}

/**
 * Button primitive over the `.btn` CSS classes. Fixed heights, one accent,
 * built-in loading state. `style` still overrides for edge cases.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary', size = 'md', loading = false,
  className, style, children, disabled, ...rest
}) => {
  const sizeClass = size === 'sm' ? ' btn-sm' : size === 'lg' ? ' btn-lg' : '';
  return (
    <button
      className={`btn btn-${variant}${sizeClass}${className ? ' ' + className : ''}`}
      style={style}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spin" style={{
        width: 13, height: 13, borderRadius: '50%',
        border: '2px solid currentColor', borderTopColor: 'transparent', display: 'inline-block',
      }} />}
      {children}
    </button>
  );
};

export default Button;
