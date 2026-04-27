import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Osprey] Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0b0f', flexDirection: 'column', gap: 16,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          <div style={{ fontSize: 32 }}>🦅</div>
          <h2 style={{ color: '#43e8d8', fontWeight: 700, fontSize: 18, margin: 0 }}>
            Osprey encountered an error
          </h2>
          <p style={{ color: '#7a7f96', fontSize: 13, maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            style={{
              background: '#43e8d8', color: '#0a0b0f', border: 'none',
              borderRadius: 10, padding: '8px 20px', fontWeight: 700,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Reload App
          </button>
          <pre style={{
            background: '#0f1117', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '12px 16px', color: '#ff4f6e',
            fontSize: 11, maxWidth: 560, overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {this.state.error?.stack?.slice(0, 600)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
