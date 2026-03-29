import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Activity, BarChart2, Briefcase, Settings, Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import RightPanel from './RightPanel';
import ModeBanner from '../account/ModeBanner';
import PositionTicker from '../shared/PositionTicker';
import { ToastContainer } from '../shared/Toast';
import { usePWA } from '../../hooks/usePWA';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../shared/Toast';
import { usePositionStore } from '../../store/positionStore';

const NAV = [
  { to: '/',           icon: LayoutGrid, label: 'Scanner'    },
  { to: '/backtest',   icon: Activity,   label: 'Backtest'   },
  { to: '/portfolio',  icon: Briefcase,  label: 'Portfolio'  },
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics'  },
  { to: '/settings',   icon: Settings,   label: 'Settings'   },
];

// Mobile bottom navigation bar
const MobileNav: React.FC = () => (
  <nav className="mobile-nav">
    {NAV.map(({ to, icon: Icon, label }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        style={({ isActive }) => ({
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: isActive ? 'var(--hl-teal)' : 'var(--text-muted)',
          textDecoration: 'none', padding: '4px 8px', fontSize: 10,
          fontFamily: 'var(--font-display)', fontWeight: 500,
          minWidth: 48,
        })}
      >
        <Icon size={20} />
        {label}
      </NavLink>
    ))}
  </nav>
);

// Mobile slide-over panel for positions
const MobilePositionsPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const positions = usePositionStore(s => s.positions);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 'min(300px, 90vw)',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--glass-border)',
          overflow: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Positions {positions.length > 0 && <span style={{ color: 'var(--hl-teal)' }}>({positions.length})</span>}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          <RightPanel embedded />
        </div>
      </div>
    </div>
  );
};

const AppShell: React.FC = () => {
  const { installable, install } = usePWA();
  const { isMobile, isTablet } = useBreakpoint();
  const [mobilePositionsOpen, setMobilePositionsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (installable) {
      setTimeout(() => toast.info('Install Osprey as an app for persistent access →'), 3000);
    }
  }, [installable]);

  const showSidebar    = !isMobile;
  const showRightPanel = !isMobile && !isTablet;

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)',
      // On mobile, add bottom padding for the nav bar
      paddingBottom: isMobile ? 64 : 0,
    }}>
      <PositionTicker />
      <ToastContainer />

      {/* PWA install banner */}
      {installable && !isMobile && (
        <div style={{
          position: 'fixed', bottom: 80, right: showRightPanel ? 256 : 20, zIndex: 998,
          background: 'var(--bg-overlay)', border: '1px solid var(--glass-border-hl)',
          borderRadius: 'var(--r-lg)', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
          fontFamily: 'var(--font-display)',
        }}>
          <span style={{ color: 'var(--hl-teal)' }}>🦅</span>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 1 }}>Install Osprey</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>Runs as an app, stays open</p>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={install}>Install</button>
        </div>
      )}

      {/* Mobile positions slide-over */}
      {isMobile && <MobilePositionsPanel open={mobilePositionsOpen} onClose={() => setMobilePositionsOpen(false)} />}

      {/* Sidebar — hidden on mobile */}
      {showSidebar && <Sidebar onPositionsClick={isTablet ? () => setMobilePositionsOpen(true) : undefined} />}

      {/* Main content column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <ModeBanner />
        <TopBar onPositionsClick={isMobile ? () => setMobilePositionsOpen(true) : undefined} positionCount={usePositionStore.getState().positions.length} />
        <main style={{
          flex: 1, overflow: 'auto',
          padding: isMobile ? '0 12px 12px' : '0 var(--sp-4) var(--sp-4)',
        }}>
          <Outlet />
        </main>
      </div>

      {/* Right panel — desktop only */}
      {showRightPanel && <RightPanel />}

      {/* Mobile bottom nav */}
      {isMobile && <MobileNav />}
    </div>
  );
};

export default AppShell;
