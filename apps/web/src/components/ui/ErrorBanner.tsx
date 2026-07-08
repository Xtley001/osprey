import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ErrorBannerProps {
  title?: string;
  message: React.ReactNode;
  /** Optional note (e.g. "Showing last successful data."). */
  note?: React.ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/**
 * Shared error banner — promoted from the hand-rolled Scanner banner so every
 * fetch surface fails the same way. Red-tinted, dismissible, retryable.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ title = 'Something went wrong', message, note, onRetry, onDismiss, style }) => (
  <div style={{
    background: 'rgba(255,90,114,0.09)', border: '1px solid rgba(255,90,114,0.28)',
    borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 'var(--sp-3)',
    display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, ...style,
  }}>
    <AlertTriangle size={15} color="var(--neg)" style={{ flexShrink: 0, marginTop: 1 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ color: 'var(--neg)', fontWeight: 600 }}>{title} — </span>
      <span style={{ color: 'var(--w-200)' }}>{message}</span>
      {note && <span style={{ color: 'var(--w-300)', marginLeft: 8 }}>{note}</span>}
    </div>
    {onRetry && (
      <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={onRetry}>Retry</button>
    )}
    {onDismiss && (
      <button onClick={onDismiss} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--w-300)', fontSize: 16, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
    )}
  </div>
);

export default ErrorBanner;
