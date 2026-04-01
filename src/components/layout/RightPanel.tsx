import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, X, AlertTriangle, Zap } from 'lucide-react';
import { usePositionStore } from '../../store/positionStore';
import { useScannerStore } from '../../store/scannerStore';
import { formatUSD, formatRateRaw, formatDuration } from '../../utils/format';
import { toast } from '../shared/Toast';

const PositionCard: React.FC<{ id: string }> = ({ id }) => {
  const navigate      = useNavigate();
  const position      = usePositionStore(s => s.positions.find(p => p.id === id));
  const closePosition = usePositionStore(s => s.closePosition);
  const [confirmClose, setConfirmClose] = useState(false);

  if (!position) return null;
  const netPnl       = position.fundingEarned - position.feesPaid;
  const driftWarning = position.hedgeDrift > 5;
  const hourlyIncome = position.currentRate * position.notional;

  return (
    <div className="glass-card" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-2)', borderColor: netPnl >= 0 ? 'var(--glass-border)' : 'rgba(255,79,110,0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-2)' }}>
        <button onClick={() => navigate(`/pair/${position.symbol}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
          {position.symbol}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className={`rate-badge ${position.currentRate > 0.0005 ? 'hot' : 'cold'}`} style={{ fontSize: 9, padding: '1px 5px' }}>
            {formatRateRaw(position.currentRate)}/hr
          </span>
          <button onClick={() => setConfirmClose(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 11, marginBottom: 'var(--sp-2)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Notional</div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{formatUSD(position.notional)}</div>
        <div style={{ color: 'var(--text-secondary)' }}>Funding</div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--accent-green)' }}>+{formatUSD(position.fundingEarned)}</div>
        <div style={{ color: 'var(--text-secondary)' }}>Net PnL</div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, color: netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {netPnl >= 0 ? '+' : ''}{formatUSD(netPnl)}
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>Held</div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{formatDuration(position.hoursHeld)}</div>
        <div style={{ color: 'var(--text-secondary)' }}>Per hour</div>
        <div style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--accent-green)', fontSize: 10 }}>+{formatUSD(hourlyIncome)}</div>
      </div>

      {driftWarning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(245,197,66,0.08)', border: '1px solid rgba(245,197,66,0.2)', borderRadius: 'var(--r-sm)', padding: '3px 7px', fontSize: 10, color: 'var(--accent-yellow)', marginBottom: 'var(--sp-2)' }}>
          <AlertTriangle size={10} /> Hedge drifted {position.hedgeDrift.toFixed(1)}%
        </div>
      )}

      {confirmClose ? (
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-danger" style={{ flex: 1, padding: '4px 0', fontSize: 10, justifyContent: 'center' }}
            onClick={() => { closePosition(id); toast.success(`${position.symbol} closed`); setConfirmClose(false); }}>
            Confirm Close
          </button>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => setConfirmClose(false)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-ghost" style={{ flex: 1, padding: '3px 0', fontSize: 10, justifyContent: 'center' }}>
            <RefreshCw size={10} /> Rebalance
          </button>
          <button className="btn btn-danger" style={{ flex: 1, padding: '3px 0', fontSize: 10, justifyContent: 'center' }} onClick={() => setConfirmClose(true)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

const RotationEngine: React.FC = () => {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(true);
  const pairs = useScannerStore(s => s.pairs);
  const top3  = [...pairs].sort((a, b) => b.currentRate - a.currentRate).slice(0, 3);

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: enabled ? 'var(--sp-2)' : 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, color: 'var(--hl-teal)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={11} /> Rotation Engine
        </span>
        <button onClick={() => setEnabled(!enabled)} style={{
          background: enabled ? 'var(--accent-green)' : 'var(--bg-surface)',
          color: enabled ? '#0a0b0f' : 'var(--text-muted)',
          border: 'none', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)',
        }}>{enabled ? 'ON' : 'OFF'}</button>
      </div>
      {enabled && top3.map((p, i) => (
        <div key={p.symbol} onClick={() => navigate(`/pair/${p.symbol}`)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: i < 2 ? '1px solid var(--glass-border)' : 'none', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', width: 10 }}>{i + 1}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{p.symbol}</span>
          </div>
          <span className={`rate-badge ${p.heat}`} style={{ fontSize: 9, padding: '1px 5px' }}>{(p.currentRate * 100).toFixed(4)}%</span>
        </div>
      ))}
    </div>
  );
};

interface RightPanelProps {
  embedded?: boolean; // when rendered inside mobile slide-over
}

const RightPanel: React.FC<RightPanelProps> = ({ embedded }) => {
  const navigate    = useNavigate();
  const positions   = usePositionStore(s => s.positions);
  const totalEarned = positions.reduce((s, p) => s + p.fundingEarned, 0);

  const content = (
    <>
      <RotationEngine />
      {positions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7 }}>
          No open positions.
          <br />
          <button className="btn btn-primary" style={{ marginTop: 10, padding: '5px 12px', fontSize: 11 }} onClick={() => navigate('/')}>
            <Zap size={11} /> Open Scanner
          </button>
        </div>
      ) : (
        positions.map(p => <PositionCard key={p.id} id={p.id} />)
      )}
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--glass-border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Positions {positions.length > 0 && <span style={{ color: 'var(--hl-teal)' }}>({positions.length})</span>}
          </p>
          {totalEarned > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-green)' }}>+{formatUSD(totalEarned)}</span>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-3)' }}>
        {content}
      </div>
    </aside>
  );
};

export default RightPanel;
