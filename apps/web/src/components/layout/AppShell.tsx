import React, { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutGrid, Activity as _Activity, BarChart2, Briefcase, Settings, Bot } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { ToastContainer } from '../shared/Toast';
import HarvestService from '../../engine/HarvestService';
import { usePWA } from '../../hooks/usePWA';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../shared/Toast';
import { usePositionStore } from '../../store/positionStore';
import { useStartupReconciliation } from '../../hooks/useStartupReconciliation';

const NAV = [
  { to: '/',          icon: LayoutGrid, label: 'Scanner'   },
  { to: '/harvest',   icon: Bot,        label: 'Harvest'   },
  { to: '/portfolio', icon: Briefcase,  label: 'Portfolio' },
  { to: '/analytics', icon: BarChart2,  label: 'Analytics' },
  { to: '/settings',  icon: Settings,   label: 'Settings'  },
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
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          color: isActive ? 'var(--hl-teal)' : 'var(--text-muted)',
          textDecoration: 'none', padding: '4px 4px', fontSize: 9,
          fontFamily: 'var(--font-body)', fontWeight: 500,
          minWidth: 44, flex: 1,
          letterSpacing: '0.02em',
        })}
      >
        <Icon size={18} />
        {label}
      </NavLink>
    ))}
  </nav>
);

const AppShell: React.FC = () => {
  const positionCount = usePositionStore(s => s.positions.length);
  const { installable, install } = usePWA();
  const { isMobile } = useBreakpoint();

  // Phase 5.2: reconcile persisted positions with live HL state on startup
  useStartupReconciliation();

  useEffect(() => {
    if (installable) {
      setTimeout(() => toast.info('Install Osprey as an app for persistent access →'), 3000);
    }
  }, [installable]);

  const showSidebar = !isMobile;

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)',
      paddingBottom: isMobile ? 64 : 0,
    }}>
      <HarvestService />
      <ToastContainer />

      {/* PWA install banner */}
      {installable && !isMobile && (
        <div style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 998,
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

      {/* Sidebar — hidden on mobile */}
      {showSidebar && <Sidebar />}

      {/* Main content column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar positionCount={positionCount} />
        <main style={{
          flex: 1, overflow: 'auto',
          padding: isMobile ? '0 12px 12px' : '0 var(--sp-4) var(--sp-4)',
        }}>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && <MobileNav />}
    </div>
  );
};

export default AppShell;
