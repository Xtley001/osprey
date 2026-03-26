import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import RightPanel from './RightPanel';
import ModeBanner from '../account/ModeBanner';
import PositionTicker from '../shared/PositionTicker';
import { ToastContainer } from '../shared/Toast';
import { usePWA } from '../../hooks/usePWA';
import { toast } from '../shared/Toast';

const AppShell: React.FC = () => {
  const { installable, install } = usePWA();

  // Show install prompt once, non-intrusively
  useEffect(() => {
    if (installable) {
      setTimeout(() => {
        toast.info('Install Osprey as an app for persistent access →');
      }, 3000);
    }
  }, [installable]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)' }}>
      <PositionTicker />
      <ToastContainer />

      {/* PWA install banner — only when browser offers it */}
      {installable && (
        <div style={{
          position: 'fixed', bottom: 80, right: 260, zIndex: 998,
          background: 'var(--bg-overlay)', border: '1px solid var(--glass-border-hl)',
          borderRadius: 'var(--r-lg)', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: 'var(--shadow-panel)', fontSize: 12,
          fontFamily: 'var(--font-display)',
        }}>
          <span style={{ color: 'var(--hl-teal)', fontSize: 20 }}>🦅</span>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 2 }}>Install Osprey</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Run as an app, stays open in background</p>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 12px' }} onClick={install}>
            Install
          </button>
        </div>
      )}

      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <ModeBanner />
        <TopBar />
        <main style={{ flex: 1, overflow: 'auto', padding: '0 var(--sp-4) var(--sp-4)' }}>
          <Outlet />
        </main>
      </div>
      <RightPanel />
    </div>
  );
};

export default AppShell;
