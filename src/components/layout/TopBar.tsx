import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useScannerStore } from '../../store/scannerStore';
import { detectRegime } from '../../engine/regime';
import { formatRateRaw } from '../../utils/format';
import { NextFundingCountdown } from '../shared/FundingCountdown';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ENABLE_TESTNET } from '../../utils/constants';

// Phase 0.3 / P0-11: surface active network so user always knows testnet vs mainnet.
const NetworkBadge: React.FC = () => (
  ENABLE_TESTNET ? (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      padding: '2px 7px', borderRadius: 4,
      background: 'rgba(255,193,7,0.15)', color: '#ffc107',
      border: '1px solid rgba(255,193,7,0.35)',
    }}>TESTNET</span>
  ) : (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      padding: '2px 7px', borderRadius: 4,
      background: 'rgba(67,232,216,0.08)', color: 'var(--hl-teal)',
      border: '1px solid rgba(67,232,216,0.2)',
    }}>MAINNET</span>
  )
);

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

const ConnectionStatus: React.FC = () => {
  const lastUpdated = useScannerStore(s => s.lastUpdated);
  const isLoading   = useScannerStore(s => s.isLoading);
  const apiError    = useScannerStore(s => s.error);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <RefreshCw size={10} className="spin" /> Fetching…
      </span>
    );
  }

  if (apiError) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}
        title={apiError}>
        <WifiOff size={10} /> API Error
      </span>
    );
  }

  if (lastUpdated === 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <WifiOff size={10} /> Not connected
      </span>
    );
  }

  const ageMs   = now - lastUpdated;
  const ageMin  = Math.floor(ageMs / 60000);
  const isStale = ageMs > 120_000;

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
      color: isStale ? 'var(--accent-yellow)' : 'var(--accent-green)',
      fontFamily: 'var(--font-mono)',
    }}>
      <Wifi size={10} />
      {isStale ? `Stale ${ageMin}m ago` : 'Live'}
    </span>
  );
};

// Live connection indicator — always live, no mode toggle
const LiveDot: React.FC = () => {
  const wallet = useAppStore(s => s.wallet);
  const isConnected = wallet.connected && wallet.address;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 'var(--r-md)',
      border: `1px solid ${isConnected ? 'rgba(245,197,66,0.3)' : 'rgba(255,79,110,0.2)'}`,
      background: isConnected ? 'rgba(245,197,66,0.08)' : 'rgba(255,79,110,0.06)',
      fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isConnected ? 'var(--accent-yellow)' : 'var(--accent-red)',
        boxShadow: `0 0 5px ${isConnected ? 'var(--accent-yellow)' : 'var(--accent-red)'}`,
        flexShrink: 0,
      }} />
      {isConnected ? (
        <>
          <span style={{ color: 'var(--accent-yellow)' }}>Live</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
            {wallet.address!.slice(0, 6)}…{wallet.address!.slice(-4)}
          </span>
        </>
      ) : (
        <span style={{ color: 'var(--accent-red)' }}>Not Connected</span>
      )}
    </div>
  );
};

interface TopBarProps {
  onPositionsClick?: () => void;
  positionCount?:    number;
}

const TopBar: React.FC<TopBarProps> = () => {
  const [spinning, setSpinning] = useState(false);
  const navigate  = useNavigate();
  const setSearch = useScannerStore(s => s.setSearch);
  const { isMobile, isTablet } = useBreakpoint();

  const handleRefresh = async () => {
    setSpinning(true);
    try {
      await useScannerStore.getState().fetchRates();
      const pairs = useScannerStore.getState().pairs;
      if (pairs.length > 0) {
        const appSt = useAppStore.getState();
        const { regime, nextPrevAvg } = detectRegime(pairs, appSt.prevRegimeAvg);
        appSt.setPrevRegimeAvg(nextPrevAvg);
        appSt.setRegime(regime);
      }
    } finally {
      setSpinning(false);
    }
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
      {!isMobile && <NetworkBadge />}
      {!isMobile && !isTablet && <NextFundingCountdown />}

      <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile && <RegimeBadge compact />}
        {!isMobile && <ConnectionStatus />}
        {!isMobile && !isTablet && <LiveDot />}

        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', gap: 5, fontSize: 12 }}
          onClick={handleRefresh}
          disabled={spinning}
        >
          <RefreshCw size={13} className={spinning ? 'spin' : ''} />
          {!isMobile && 'Refresh'}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
