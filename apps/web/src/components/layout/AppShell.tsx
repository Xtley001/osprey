import React, { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { NAV_ITEMS } from './nav';
import { ToastContainer } from '../shared/Toast';
import HarvestService from '../../engine/HarvestService';
import { usePWA } from '../../hooks/usePWA';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { toast } from '../shared/Toast';
import { usePositionStore } from '../../store/positionStore';
import { useStartupReconciliation } from '../../hooks/useStartupReconciliation';

// Mobile bottom bar shows the primary destinations only (Developers/Settings
// live in the "More"/sidebar surface) to keep tap targets ≥44px.
const NAV = NAV_ITEMS.filter(n => n.primary);

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

const INSTALL_DISMISS_KEY = 'osprey_install_dismissed_v1';

const AppShell: React.FC = () => {
  const positionCount = usePositionStore(s => s.positions.length);
  const { installable, install, updateReady, applyUpdate } = usePWA();
  const { isMobile } = useBreakpoint();

  // Install banner is dismissible and stays dismissed (audit P3 — was double-prompting).
  const [installDismissed, setInstallDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
  });
  const dismissInstall = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  // Phase 5.2: reconcile persisted positions with live HL state on startup
  useStartupReconciliation();

  // Non-blocking "new version" prompt instead of an automatic mid-session reload
  // (audit P0-4). User opts in; applyUpdate() activates the waiting worker.
  useEffect(() => {
    if (updateReady) {
      toast.info('New version available — click Refresh to update.');
    }
  }, [updateReady]);

  const showInstall = installable && !isMobile && !installDismissed;
  const showSidebar = !isMobile;

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)',
      paddingBottom: isMobile ? 64 : 0,
    }}>
      <HarvestService />
      <ToastContainer />

      {/* SW update prompt — opt-in, top-center, non-blocking */}
      {updateReady && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 999,
          background: 'var(--bg-overlay)', border: '1px solid var(--glass-border-hl)',
          borderRadius: 'var(--r-lg)', padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
          fontFamily: 'var(--font-display)', boxShadow: 'var(--shadow-panel)',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>A new version of Osprey is ready.</span>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={applyUpdate}>Refresh</button>
        </div>
      )}

      {/* PWA install banner — dismissible */}
      {showInstall && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 998,
          background: 'var(--bg-overlay)', border: '1px solid var(--glass-border-hl)',
          borderRadius: 'var(--r-lg)', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
          fontFamily: 'var(--font-display)', boxShadow: 'var(--shadow-panel)',
        }}>
          <span style={{ color: 'var(--hl-teal)' }}>🦅</span>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 1 }}>Install Osprey</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>Runs as an app, stays open</p>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={install}>Install</button>
          <button onClick={dismissInstall} aria-label="Dismiss install prompt"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Sidebar — hidden on mobile */}
      {showSidebar && <Sidebar />}

      {/* Main content column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar positionCount={positionCount} />
        <main id="app-scroll" style={{
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
