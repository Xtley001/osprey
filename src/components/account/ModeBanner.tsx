import React from 'react';
import { useAppStore } from '../../store/appStore';
import { formatUSD } from '../../utils/format';

const ModeBanner: React.FC = () => {
  const mode      = useAppStore(s => s.mode);
  const demo      = useAppStore(s => s.demo);
  const wallet    = useAppStore(s => s.wallet);
  const setMode   = useAppStore(s => s.setMode);
  const resetDemo = useAppStore(s => s.resetDemo);

  const isDemo = mode === 'demo';

  // Demo = muted blue (practice/safe)   Real = gold/amber (live/premium)
  const demoBg     = 'rgba(91,141,238,0.07)';
  const demoBorder = 'rgba(91,141,238,0.18)';
  const demoColor  = 'var(--accent-blue)';
  const realBg     = 'rgba(245,197,66,0.08)';
  const realBorder = 'rgba(245,197,66,0.25)';
  const realColor  = 'var(--accent-yellow)';

  return (
    <div style={{
      background: isDemo ? demoBg : realBg,
      borderBottom: `1px solid ${isDemo ? demoBorder : realBorder}`,
      padding: '5px var(--sp-4)',
      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
      flexShrink: 0, fontSize: 12,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: isDemo ? demoColor : realColor,
        boxShadow: `0 0 5px ${isDemo ? demoColor : realColor}`,
      }} />

      {isDemo ? (
        <>
          <span style={{ fontWeight: 700, color: demoColor, letterSpacing: '0.04em' }}>DEMO</span>
          <span style={{ color: 'var(--text-secondary)' }}>Paper trading · no real orders</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {formatUSD(demo.balance)}
          </span>
          {demo.fundingEarned > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)', fontSize: 11 }}>
              +{formatUSD(demo.fundingEarned)} earned
            </span>
          )}
        </>
      ) : (
        <>
          <span style={{ fontWeight: 700, color: realColor, letterSpacing: '0.04em' }}>LIVE</span>
          <span style={{ color: 'var(--text-secondary)' }}>Real orders · live capital</span>
          {wallet.connected ? (
            <span style={{ fontFamily: 'var(--font-mono)', color: realColor, fontSize: 11 }}>
              {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
            </span>
          ) : (
            <span style={{ color: 'var(--accent-red)', fontSize: 11, fontWeight: 600 }}>
              ⚠ Wallet not connected
            </span>
          )}
        </>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-2)' }}>
        {isDemo && (
          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={resetDemo}>
            Reset
          </button>
        )}
        <button
          className="btn btn-ghost"
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={() => setMode(isDemo ? 'real' : 'demo')}
        >
          {isDemo ? 'Switch to Live →' : '← Back to Demo'}
        </button>
      </div>
    </div>
  );
};

export default ModeBanner;
