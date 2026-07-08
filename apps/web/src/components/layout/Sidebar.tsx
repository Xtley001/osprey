import React from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { Bird } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { NAV_ITEMS } from './nav';

const NAV = NAV_ITEMS;

interface SidebarProps {
  onPositionsClick?: () => void;
}

// Wallet status bar at the bottom of the sidebar
const WalletStatusBar: React.FC = () => {
  const wallet   = useAppStore(s => s.wallet);
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate('/app/settings')}
      style={{
        padding: 'var(--sp-3) var(--sp-4)',
        borderTop: '1px solid var(--glass-border)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: wallet.connected ? 'var(--accent-green)' : 'var(--text-muted)',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        {wallet.connected && wallet.address
          ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
          : 'Connect Wallet → Settings'
        }
      </span>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = () => {
  const { isTablet } = useBreakpoint();
  const navigate = useNavigate();
  const connected = useAppStore(s => s.wallet.connected);
  const collapsed = isTablet;

  return (
    <aside style={{
      width: collapsed ? 60 : 220,
      flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex', flexDirection: 'column',
      padding: 'var(--sp-4) 0',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Logo — links back to the landing page */}
      <Link to="/" title="Osprey home" style={{ textDecoration: 'none', padding: collapsed ? '0 0 20px' : '0 var(--sp-4) var(--sp-6)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Bird size={22} color="var(--accent)" />
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--w-000)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            OSPREY
          </span>
        )}
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: collapsed ? '0 4px' : '0 var(--sp-2)' }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to} end={to === '/app'}
            title={collapsed ? label : undefined}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 'var(--sp-3)',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '9px 0' : 'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--r-md)',
              color: isActive ? 'var(--hl-teal)' : 'var(--text-secondary)',
              background: isActive ? 'var(--hl-teal-dim)' : 'transparent',
              textDecoration: 'none', fontFamily: 'var(--font-display)',
              fontWeight: 500, fontSize: 13, transition: 'all var(--t-fast)',
            })}
          >
            <Icon size={16} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Wallet status — collapsed shows dot only */}
      {collapsed ? (
        <div
          style={{ padding: '8px 4px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}
          onClick={() => navigate('/app/settings')}
          title={connected ? 'Wallet connected · Settings' : 'Not connected · Settings'}
        >
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? 'var(--accent-green)' : 'var(--text-muted)',
          }} />
        </div>
      ) : (
        <WalletStatusBar />
      )}
    </aside>
  );
};

export default Sidebar;
