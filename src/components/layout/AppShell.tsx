import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import RightPanel from './RightPanel';
import ModeBanner from '../account/ModeBanner';
import PositionTicker from '../shared/PositionTicker';
import { ToastContainer } from '../shared/Toast';

const AppShell: React.FC = () => (
  <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-page)' }}>
    {/* Global services — render nothing, run forever */}
    <PositionTicker />
    <ToastContainer />

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

export default AppShell;
