import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useScannerStore } from '../../store/scannerStore';
import { detectRegime } from '../../engine/regime';
import { formatRateRaw } from '../../utils/format';
import { LiveClock, NextFundingCountdown } from '../shared/LiveClock';

const RegimeBadge: React.FC = () => {
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
      display: 'flex', alignItems: 'center', gap: 10,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 'var(--r-md)', padding: '4px 12px', fontSize: 11,
    }}>
      <span style={{ color: c.color, fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 12 }}>
        {emoji} {regime.label}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        {formatRateRaw(regime.marketAvgRate)}/hr
      </span>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        {Math.round(regime.breadth * 100)}% {arrow}
      </span>
    </div>
  );
};

const TopBar: React.FC = () => {
  const [spinning, setSpinning] = useState(false);
  const navigate    = useNavigate();
  const setSearch   = useScannerStore(s => s.setSearch);

  const handleRefresh = async () => {
    setSpinning(true);
    try {
      await useScannerStore.getState().fetchRates();
      const regime = detectRegime(useScannerStore.getState().pairs);
      useAppStore.getState().setRegime(regime);
    } finally {
      setSpinning(false);
    }
  };

  return (
    <header style={{
      height: 52, display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 var(--sp-4)', borderBottom: '1px solid var(--glass-border)',
      background: 'var(--bg-surface)', flexShrink: 0,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '0 0 200px' }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          className="input"
          onChange={e => { setSearch(e.target.value); if (e.target.value) navigate('/'); }}
          placeholder="Search pair…"
          style={{ paddingLeft: 28, height: 32 }}
        />
      </div>

      <RegimeBadge />
      <NextFundingCountdown />

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <LiveClock />
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', gap: 6, fontSize: 12 }}
          onClick={handleRefresh}
          disabled={spinning}
        >
          <RefreshCw size={13} className={spinning ? 'spin' : ''} />
          Refresh
        </button>
      </div>
    </header>
  );
};

export default TopBar;
