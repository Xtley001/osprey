import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Activity, BarChart2, Briefcase, Settings, Bird, Layers, Bot } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const NAV = [
  { to: '/',           icon: LayoutGrid, label: 'Scanner'    },
  { to: '/backtest',   icon: Activity,   label: 'Backtester' },
  { to: '/portfolio',  icon: Briefcase,  label: 'Portfolio'  },
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics'  },
  { to: '/autotrader', icon: Bot,        label: 'Auto-Trade' },
  { to: '/settings',   icon: Settings,   label: 'Settings'   },
];

interface SidebarProps {
  onPositionsClick?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onPositionsClick }) => {
  const mode     = useAppStore(s => s.mode);
  const setMode  = useAppStore(s => s.setMode);
  const navigate  = useNavigate();
  const { isTablet } = useBreakpoint();

  // On tablet, collapse to icon-only sidebar
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
      {/* Logo */}
      <div style={{ padding: collapsed ? '0 0 20px' : '0 var(--sp-4) var(--sp-6)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Bird size={22} color="var(--hl-teal)" />
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--hl-teal)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            OSPREY
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: collapsed ? '0 4px' : '0 var(--sp-2)' }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
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

        {/* Positions button on tablet */}
        {onPositionsClick && (
          <button
            onClick={onPositionsClick}
            title="Positions"
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 'var(--sp-3)',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '9px 0' : 'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--r-md)',
              color: 'var(--text-secondary)', background: 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)',
              fontWeight: 500, fontSize: 13, transition: 'all var(--t-fast)', width: '100%',
            }}
          >
            <Layers size={16} />
            {!collapsed && 'Positions'}
          </button>
        )}
      </nav>

      {/* Mode toggle */}
      {!collapsed && (
        <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid var(--glass-border)' }}>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Mode
          </p>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 2 }}>
            <button onClick={() => setMode('demo')} style={{
              flex: 1, padding: '5px 0', borderRadius: 'var(--r-sm)', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all var(--t-fast)',
              background: mode === 'demo' ? 'var(--accent-blue)' : 'transparent',
              color:      mode === 'demo' ? '#fff' : 'var(--text-muted)',
            }}>Demo</button>
            <button onClick={() => { setMode('real'); navigate('/settings'); }} style={{
              flex: 1, padding: '5px 0', borderRadius: 'var(--r-sm)', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all var(--t-fast)',
              background: mode === 'real' ? 'var(--accent-yellow)' : 'transparent',
              color:      mode === 'real' ? '#0a0b0f' : 'var(--text-muted)',
            }}>Live</button>
          </div>
        </div>
      )}

      {/* Collapsed mode indicator */}
      {collapsed && (
        <div style={{ padding: '8px 4px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: mode === 'demo' ? 'var(--accent-blue)' : 'var(--accent-yellow)',
          }} title={mode === 'demo' ? 'Demo mode' : 'Live mode'} />
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
