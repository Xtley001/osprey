import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Layers } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useScannerStore } from '../../store/scannerStore';
import { detectRegime } from '../../engine/regime';
import { formatRateRaw } from '../../utils/format';
import { LiveClock, NextFundingCountdown } from '../shared/LiveClock';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const RegimeBadge: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const regime = useAppStore(s => s.regime);
  const c = {
    HOT:     { bg: 'rgba(255,140,66,0.15)', color: 'var(--accent-orange)', border: 'rgba(255,140,66,0.3)' },
    NEUTRAL: { bg: 'var(--hl-teal-dim)',    color: 'var(--hl-teal)',       border: 'var(--glass-border-hl)' },
    COLD:    { bg: 'rgba(68,71,90,0.4)',    color: 'var(--text-muted)',    border: 'var(--glass-border)' },
  }[regime.label];
  const emoji = { HOT: '🔥', NEUTRAL: '🌤', COLD: '🧊' }[regime.label];
  const arrow = { rising: '↑', falling: '↓', stable: '→' }[regime.trend];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: compact ? 5 : 10,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 'var(--r-md)', padding: compact ? '3px 8px' : '4px 12px', fontSize: 11,
    }}>
      <span style={{ color: c.color, fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: compact ? 11 : 12 }}>
        {emoji} {regime.label}
      </span>
      {!compact && <>
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          {formatRateRaw(regime.marketAvgRate)}/hr
        </span>
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          {Math.round(regime.breadth * 100)}% {arrow}
        </span>
      </>}
    </div>
  );
};

interface TopBarProps {
  onPositionsClick?: () => void;
  positionCount?: number;
}

const TopBar: React.FC<TopBarProps> = ({ onPositionsClick, positionCount = 0 }) => {
  const [spinning, setSpinning] = useState(false);
  const navigate   = useNavigate();
  const setSearch  = useScannerStore(s => s.setSearch);
  const { isMobile, isTablet } = useBreakpoint();

  const handleRefresh = async () => {
    setSpinning(true);
    try {
      await useScannerStore.getState().fetchRates();
      const regime = detectRegime(useScannerStore.getState().pairs);
      useAppStore.getState().setRegime(regime);
    } finally { setSpinning(false); }
  };

  return (
    <header style={{
      height: isMobile ? 48 : 52,
      display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
      padding: isMobile ? '0 12px' : '0 var(--sp-4)',
      borderBottom: '1px solid var(--glass-border)',
      background: 'var(--bg-surface)', flexShrink: 0,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: isMobile ? 1 : '0 0 200px', maxWidth: isMobile ? undefined : 200 }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          className="input"
          onChange={e => { setSearch(e.target.value); if (e.target.value) navigate('/'); }}
          placeholder="Search pair…"
          style={{ paddingLeft: 28, height: 32 }}
        />
      </div>

      {!isMobile && <RegimeBadge compact={isTablet} />}
      {!isMobile && !isTablet && <NextFundingCountdown />}

      <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile && <RegimeBadge compact />}
        {!isMobile && !isTablet && <LiveClock />}

        {/* Positions button on mobile/tablet */}
        {onPositionsClick && (
          <button
            onClick={onPositionsClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--glass-border)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
              fontFamily: 'var(--font-display)', fontWeight: 600, transition: 'all var(--t-fast)',
              position: 'relative',
            }}
          >
            <Layers size={14} />
            {!isMobile && 'Positions'}
            {positionCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                borderRadius: '50%', background: 'var(--hl-teal)', color: '#0a0b0f',
                fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{positionCount}</span>
            )}
          </button>
        )}

        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', gap: 5, fontSize: 12 }}
          onClick={handleRefresh} disabled={spinning}
        >
          <RefreshCw size={13} className={spinning ? 'spin' : ''} />
          {!isMobile && 'Refresh'}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
