import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Activity, BarChart2, Briefcase, Settings, Bird } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

const NAV = [
  { to: '/',           icon: LayoutGrid, label: 'Scanner'    },
  { to: '/backtest',   icon: Activity,   label: 'Backtester' },
  { to: '/portfolio',  icon: Briefcase,  label: 'Portfolio'  },
  { to: '/analytics',  icon: BarChart2,  label: 'Analytics'  },
  { to: '/settings',   icon: Settings,   label: 'Settings'   },
];

const Sidebar: React.FC = () => {
  const mode    = useAppStore(s => s.mode);
  const setMode = useAppStore(s => s.setMode);
  const navigate = useNavigate();

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex', flexDirection: 'column', padding: 'var(--sp-4) 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 var(--sp-4) var(--sp-6)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bird size={22} color="var(--hl-teal)" />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--hl-teal)', letterSpacing: '-0.02em' }}>
          OSPREY
        </span>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 var(--sp-2)' }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
              padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-md)',
              color: isActive ? 'var(--hl-teal)' : 'var(--text-secondary)',
              background: isActive ? 'var(--hl-teal-dim)' : 'transparent',
              textDecoration: 'none', fontFamily: 'var(--font-display)',
              fontWeight: 500, fontSize: 13, transition: 'all var(--t-fast)',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Mode toggle — Demo=blue, Live=gold */}
      <div style={{ padding: 'var(--sp-4)', borderTop: '1px solid var(--glass-border)' }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Account Mode
        </p>
        <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 2 }}>
          <button
            onClick={() => setMode('demo')}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 'var(--r-sm)', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
              transition: 'all var(--t-fast)',
              background: mode === 'demo' ? 'var(--accent-blue)' : 'transparent',
              color:      mode === 'demo' ? '#fff'               : 'var(--text-muted)',
            }}
          >
            Demo
          </button>
          <button
            onClick={() => { setMode('real'); navigate('/settings'); }}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 'var(--r-sm)', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
              transition: 'all var(--t-fast)',
              background: mode === 'real' ? 'var(--accent-yellow)' : 'transparent',
              color:      mode === 'real' ? '#0a0b0f'              : 'var(--text-muted)',
            }}
          >
            Live
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
