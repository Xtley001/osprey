import React, { useState, useEffect } from 'react';
import { useHarvestStore } from '../store/harvestStore';
import { useAppStore } from '../store/appStore';
import { usePositionStore } from '../store/positionStore';
import { useScannerStore } from '../store/scannerStore';
import { useEquityCurveStore } from '../store/equityCurveStore';
import { formatUSD, formatRateRaw, formatDuration } from '../utils/format';
import { NextFundingCountdown } from '../components/shared/FundingCountdown';
import ArmEngineModal from '../components/shared/ArmEngineModal';
import { Zap, ZapOff, Trash2, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useBreakpoint } from '../hooks/useBreakpoint';
import type { HarvestConfig } from '../types/harvest';
import type { HarvestEventType } from '../types/harvest';

// ── Config slider+input row ───────────────────────────────────────────────────
const ConfigRow: React.FC<{
  label: string;
  value: number;
  display?: string;
  inputDisplay?: number;
  inputUnit?: string;
  min: number; max: number; step: number;
  inputMin?: number; inputMax?: number; inputStep?: number;
  scale?: number;
  onChange: (v: number) => void;
}> = ({ label, value, display, inputDisplay, inputUnit, min, max, step, inputMin, inputMax, inputStep, scale = 1, onChange }) => {
  const rawInput = inputDisplay !== undefined ? inputDisplay : value * (scale !== 1 ? scale : 1);
  const iMin = inputMin ?? min * (scale !== 1 ? scale : 1);
  const iMax = inputMax ?? max * (scale !== 1 ? scale : 1);
  const iStep = inputStep ?? step * (scale !== 1 ? scale : 1);

  const handleInput = (raw: string) => {
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return;
    const clamped = Math.min(iMax, Math.max(iMin, parsed));
    onChange(scale !== 1 ? clamped / scale : clamped);
  };

  return (
    <div style={{ marginBottom: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number" min={iMin} max={iMax} step={iStep} value={rawInput}
            onChange={e => handleInput(e.target.value)}
            onBlur={e => handleInput(e.target.value)}
            style={{
              width: 80, height: 28,
              background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--r-sm)', color: 'var(--hl-teal)',
              fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
              textAlign: 'right', padding: '0 6px', outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--hl-teal)')}
          />
          {inputUnit && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{inputUnit}</span>}
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--hl-teal)', cursor: 'pointer' }}
      />
    </div>
  );
};

const ToggleSwitch: React.FC<{ on: boolean; onChange: () => void; label: string; desc: string }> = ({ on, onChange, label, desc }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--glass-border)' }}>
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</p>
    </div>
    <button onClick={onChange} style={{
      flexShrink: 0, width: 44, height: 24, borderRadius: 12,
      background: on ? 'var(--accent-green)' : 'var(--bg-elevated)',
      border: `1px solid ${on ? 'var(--accent-green)' : 'var(--glass-border)'}`,
      cursor: 'pointer', position: 'relative', transition: 'all 0.2s', padding: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 22 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: on ? '#0a0b0f' : 'var(--text-muted)',
        transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  </div>
);

// ── Activity log with filter ──────────────────────────────────────────────────
type LogFilter = 'ALL' | 'ENTRY' | 'EXIT' | 'ROTATE' | 'ERROR' | 'INFO';

const ActivityLog: React.FC<{ maxH?: number }> = ({ maxH = 280 }) => {
  const log      = useHarvestStore(s => s.log);
  const clearLog = useHarvestStore(s => s.clearLog);
  const [logFilter, setLogFilter] = useState<LogFilter>('ALL');

  const colors: Record<string, string> = {
    ENTRY: 'var(--accent-green)', ENTER_PERP: 'var(--accent-green)', ENTER_SPOT: 'var(--accent-green)',
    ENTER_COMPLETE: 'var(--accent-green)', ENTER_FAILED: 'var(--accent-red)',
    EXIT: 'var(--accent-yellow)', EXIT_PERP: 'var(--accent-yellow)', EXIT_SPOT: 'var(--accent-yellow)',
    EXIT_COMPLETE: 'var(--accent-yellow)', EXIT_FAILED: 'var(--accent-red)',
    ROTATE: 'var(--hl-teal)', REBALANCE: 'var(--hl-teal)', FUNDING_ACCRUED: 'var(--accent-green)',
    REGIME_CHANGE: 'var(--hl-teal)', SKIP: 'var(--text-muted)', ERROR: 'var(--accent-red)', INFO: 'var(--text-secondary)',
  };
  const icons: Record<string, string> = {
    ENTRY: '↗', ENTER_PERP: '↗', ENTER_SPOT: '↗', ENTER_COMPLETE: '✓', ENTER_FAILED: '✗',
    EXIT: '↙', EXIT_PERP: '↙', EXIT_SPOT: '↙', EXIT_COMPLETE: '✓', EXIT_FAILED: '✗',
    ROTATE: '↻', REBALANCE: '⇄', FUNDING_ACCRUED: '$', REGIME_CHANGE: '◈', SKIP: '–', ERROR: '⚠', INFO: '·',
  };

  const filterMatch = (type: HarvestEventType): boolean => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'ENTRY') return type === 'ENTRY' || type.startsWith('ENTER');
    if (logFilter === 'EXIT')  return type === 'EXIT'  || type.startsWith('EXIT');
    if (logFilter === 'ROTATE') return type === 'ROTATE';
    if (logFilter === 'ERROR') return type === 'ERROR';
    if (logFilter === 'INFO')  return type === 'INFO' || type === 'SKIP';
    return true;
  };

  const filteredLog = log.filter(l => filterMatch(l.type as HarvestEventType));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activity Log</p>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {(['ALL', 'ENTRY', 'EXIT', 'ROTATE', 'ERROR'] as LogFilter[]).map(f => (
            <button key={f} onClick={() => setLogFilter(f)} style={{
              padding: '1px 7px', borderRadius: 'var(--r-sm)', fontSize: 9, fontWeight: 600,
              fontFamily: 'var(--font-display)', cursor: 'pointer', border: 'none',
              background: logFilter === f ? 'var(--hl-teal)' : 'var(--bg-elevated)',
              color: logFilter === f ? '#0a0b0f' : 'var(--text-muted)',
              transition: 'all var(--t-fast)',
            }}>{f}</button>
          ))}
          {log.length > 0 && (
            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }} onClick={clearLog}>
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
      </div>
      {filteredLog.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
          {log.length === 0 ? 'No activity yet — enable auto-trader to start.' : 'No entries match this filter.'}
        </p>
      ) : (
        <div style={{ maxHeight: maxH, overflowY: 'auto' }}>
          {filteredLog.map(entry => (
            <div key={entry.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
              <span style={{ color: colors[entry.type] ?? 'var(--text-muted)', fontSize: 13, fontWeight: 700, flexShrink: 0, width: 16, textAlign: 'center', lineHeight: 1.3 }}>
                {icons[entry.type] ?? '·'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {entry.symbol && <strong style={{ color: 'var(--text-primary)', marginRight: 5 }}>{entry.symbol}</strong>}
                  {entry.message}
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                  {entry.rate !== undefined && ` · ${(entry.rate * 100).toFixed(4)}%`}
                </p>
              </div>
              {entry.pnl !== undefined && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, flexShrink: 0, color: entry.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {entry.pnl >= 0 ? '+' : ''}{formatUSD(entry.pnl)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// ── Collapsible accordion card ────────────────────────────────────────────────
const Accordion: React.FC<{ title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode; accent?: boolean }> = ({
  title, subtitle, defaultOpen = false, children, accent = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card" style={{ overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 'var(--sp-4)', background: accent && open ? 'rgba(67,232,216,0.04)' : 'none',
        border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
        borderBottom: open ? '1px solid var(--glass-border)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: accent ? 'var(--hl-teal)' : 'var(--text-primary)' }}>{title}</span>
          {subtitle && !open && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{subtitle}</span>}
        </div>
        {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </button>
      {open && <div style={{ padding: 'var(--sp-4)' }}>{children}</div>}
    </div>
  );
};

// ── Position card ─────────────────────────────────────────────────────────────
const PositionCard: React.FC<{ pos: ReturnType<typeof usePositionStore.getState>['positions'][0] }> = ({ pos }) => {
  const net = pos.fundingEarned - pos.feesPaid;
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>{pos.symbol}</span>
        <span className={`rate-badge ${pos.currentRate > 0.0005 ? 'hot' : pos.currentRate > 0.0002 ? 'warm' : 'cold'}`}>
          {formatRateRaw(pos.currentRate)}/hr
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {([
          ['Notional', formatUSD(pos.notional), 'var(--text-primary)'],
          ['Held', formatDuration(pos.hoursHeld), 'var(--text-primary)'],
          ['Earned', '+' + formatUSD(pos.fundingEarned), 'var(--accent-green)'],
          ['Net P&L', (net >= 0 ? '+' : '') + formatUSD(net), net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'],
        ] as [string, string, string][]).map(([label, val, color]) => (
          <div key={label}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color }}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main toggle ───────────────────────────────────────────────────────────────
const MainToggle: React.FC<{
  enabled: boolean;
  canEnable: boolean;
  running: boolean;
  /** Called when engine is already enabled (OFF direction) or after arm confirmed */
  onToggle: () => void;
  /** Called when user initiates OFF→ON — opens the arm modal */
  onRequestArm: () => void;
  fullWidth?: boolean;
}> = ({
  enabled, canEnable, running, onToggle, onRequestArm, fullWidth,
}) => {
  const Icon = enabled ? ZapOff : Zap;
  const handleClick = () => {
    if (!canEnable) return;
    // P0-09: if turning ON, show confirm modal rather than enabling directly.
    if (!enabled) {
      onRequestArm();
    } else {
      onToggle();
    }
  };
  return (
    <button
      onClick={handleClick}
      disabled={!canEnable}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: fullWidth ? 52 : 40,
        paddingLeft: fullWidth ? 24 : 22, paddingRight: fullWidth ? 24 : 22,
        width: fullWidth ? '100%' : 'auto',
        borderRadius: 100,
        border: enabled ? '1.5px solid rgba(255,79,110,0.4)' : '1.5px solid transparent',
        background: enabled ? 'rgba(255,79,110,0.12)' : canEnable ? 'var(--accent-green)' : 'var(--bg-elevated)',
        color: enabled ? 'var(--accent-red)' : canEnable ? '#0a0b0f' : 'var(--text-muted)',
        cursor: canEnable ? 'pointer' : 'not-allowed',
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: fullWidth ? 16 : 14,
        transition: 'all 0.2s',
        boxShadow: (!enabled && canEnable) ? '0 0 20px rgba(0,212,160,0.25)' : 'none',
      }}
    >
      <Icon size={fullWidth ? 18 : 16} />
      {enabled ? (running ? 'Running…' : 'Stop') : 'Start Auto-Trader'}
    </button>
  );
};

// ── Config panel ──────────────────────────────────────────────────────────────
const ConfigPanel: React.FC<{ config: HarvestConfig; update: (d: Partial<HarvestConfig>) => void }> = ({ config, update }) => (
  <>
    <ConfigRow label="Capital per position" inputUnit="USDC" value={config.capitalPerPosition} inputDisplay={config.capitalPerPosition}
      min={100} max={10000} step={100} onChange={v => update({ capitalPerPosition: v })} />
    <ConfigRow label="Max positions" value={config.maxPositions} min={1} max={100} step={1}
      onChange={v => update({ maxPositions: v })} />
    <ConfigRow label="Entry threshold" inputUnit="%/hr" value={config.entryThreshold}
      inputDisplay={parseFloat((config.entryThreshold * 100).toFixed(4))}
      min={0.00001} max={0.002} step={0.00001} inputMin={0.001} inputMax={0.200} inputStep={0.001} scale={100}
      onChange={v => update({ entryThreshold: v })} />
    <ConfigRow label="Exit threshold" inputUnit="%/hr" value={config.exitThreshold}
      inputDisplay={parseFloat((config.exitThreshold * 100).toFixed(4))}
      min={0.00001} max={0.001} step={0.00001} inputMin={0.001} inputMax={0.100} inputStep={0.001} scale={100}
      onChange={v => update({ exitThreshold: v })} />
    <ConfigRow label="Max hold hours" inputUnit="h"
      value={config.maxHoldHours} inputDisplay={config.maxHoldHours}
      min={6} max={720} step={6} onChange={v => update({ maxHoldHours: v })} />
    <ConfigRow label="Min open interest" inputUnit="USDC" value={config.minOI} inputDisplay={config.minOI}
      min={100000} max={10000000} step={100000} inputStep={100000} onChange={v => update({ minOI: v })} />
    <div style={{ marginTop: 4 }}>
      <ToggleSwitch on={config.rotationEnabled} onChange={() => update({ rotationEnabled: !config.rotationEnabled })} label="Auto-rotate" desc="Move to higher-rate pair when profitable after fees" />
      <ToggleSwitch on={config.regimeGate} onChange={() => update({ regimeGate: !config.regimeGate })} label="Regime gate" desc="Pause new entries when market is COLD" />
    </div>
  </>
);

// ── Stat card (shared between status bar and page) ───────────────────────────
const StatCard: React.FC<{ label: string; value: string; valueColor?: string; sub?: string }> = ({ label, value, valueColor, sub }) => (
  <div className="glass-card" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
    <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: valueColor ?? 'var(--text-primary)' }}>{value}</p>
    {sub && <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</p>}
  </div>
);

// ── Status bar ────────────────────────────────────────────────────────────────
const HarvestStatusBar: React.FC = () => {
  const config    = useHarvestStore(s => s.config);
  const running   = useHarvestStore(s => s.running);
  const positions = usePositionStore(s => s.positions);
  const regime    = useAppStore(s => s.regime);
  const hwm       = useEquityCurveStore(s => s.highWaterMark);
  const curve     = useEquityCurveStore(s => s.curve);

  const todayEarned = positions.reduce((s, p) => s + p.fundingEarned, 0);
  const currentEquity = curve.length > 0 ? curve[curve.length - 1].cumulativeNet : 0;
  const isCBActive = config.maxDrawdownPct > 0 && hwm > 0 &&
    ((hwm - currentEquity) / hwm * 100) >= config.maxDrawdownPct;

  const regimeColors: Record<string, string> = {
    HOT: 'var(--accent-orange)', NEUTRAL: 'var(--hl-teal)', COLD: 'var(--text-muted)',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
      <StatCard label="Regime" value={`${regime.label === 'HOT' ? '🔥' : regime.label === 'NEUTRAL' ? '🌤' : '🧊'} ${regime.label}`}
        valueColor={regimeColors[regime.label]} sub={`${regime.confidence}% confidence`} />
      <StatCard label="Positions" value={`${positions.length} / ${config.maxPositions}`} />
      <StatCard label="Earned Today" value={`+$${todayEarned.toFixed(2)}`} valueColor="var(--accent-green)" />
      <StatCard label="Engine"
        value={running ? 'Running' : config.enabled ? 'Idle' : 'Paused'}
        valueColor={running ? 'var(--accent-green)' : config.enabled ? 'var(--accent-yellow)' : 'var(--text-muted)'} />
      {isCBActive && (
        <StatCard label="⛔ Circuit Breaker" value="ACTIVE" valueColor="var(--accent-red)" sub="New entries blocked" />
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const Harvest: React.FC = () => {
  const { config, running, lastRunAt, nextRunAt, totalAutoEarned, totalAutoFees, updateConfig, toggle } = useHarvestStore();
  const wallet    = useAppStore(s => s.wallet);
  const positions = usePositionStore(s => s.positions);
  const pairs     = useScannerStore(s => s.pairs);
  const { isMobile } = useBreakpoint();

  // P0-09: arm modal state
  const [showArmModal, setShowArmModal] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const netProfit     = totalAutoEarned - totalAutoFees;
  const bestPair      = [...pairs]
    .filter(p => p.currentRate >= config.entryThreshold && p.openInterest >= config.minOI)
    .sort((a, b) => b.currentRate - a.currentRate)[0];
  const canEnable     = wallet.connected;
  const minsToNext    = nextRunAt > 0 ? Math.max(0, Math.round((nextRunAt - nowMs) / 60000)) : null;

  const configSummary = `${(config.entryThreshold * 10000).toFixed(2)} bps/hr · ${config.maxPositions} slots · ${config.maxHoldHours / 24}d max hold`;

  // ── MOBILE ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="fade-in" style={{ paddingTop: 'var(--sp-3)', paddingBottom: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>
              Harvest Engine
            </h1>
            {lastRunAt > 0 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                Last: {new Date(lastRunAt).toLocaleTimeString()}
                {minsToNext !== null && ` · next ~${minsToNext}m`}
              </p>
            )}
          </div>
          {config.enabled && (
            <span style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 100, fontWeight: 700,
              background: running ? 'rgba(245,197,66,0.15)' : 'rgba(0,212,160,0.12)',
              color: running ? 'var(--accent-yellow)' : 'var(--accent-green)',
              border: `1px solid ${running ? 'rgba(245,197,66,0.3)' : 'rgba(0,212,160,0.25)'}`,
            }}>
              {running ? '⟳ Running' : '● Active'}
            </span>
          )}
        </div>

        {!wallet.connected && (
          <div style={{
            background: 'rgba(255,79,110,0.08)', border: '1px solid rgba(255,79,110,0.25)',
            borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 'var(--sp-3)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--accent-red)' }}>Wallet not connected.</strong>{' '}
              Go to Settings to connect. Agent Key required for automated trading.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 'var(--sp-3)' }}>
          {[
            { label: 'Open', value: `${positions.length}/${config.maxPositions}`, color: 'var(--text-primary)' },
            { label: 'Earned', value: formatUSD(totalAutoEarned), color: 'var(--accent-green)' },
            { label: 'Net', value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
            { label: 'Fees', value: formatUSD(totalAutoFees), color: 'var(--accent-red)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-md)', padding: '8px 6px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <MainToggle enabled={config.enabled} canEnable={canEnable} running={running} onToggle={toggle} onRequestArm={() => setShowArmModal(true)} fullWidth />
        </div>

        {positions.length > 0 ? (
          <Accordion title={`Active Positions (${positions.length})`} subtitle={`+${formatUSD(positions.reduce((s, p) => s + p.fundingEarned, 0))} accruing`} defaultOpen>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {positions.map(pos => <PositionCard key={pos.id} pos={pos} />)}
            </div>
          </Accordion>
        ) : (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {config.enabled ? 'Watching for opportunities…' : 'Tap Start to begin'}
          </div>
        )}

        <Accordion title="Engine Config" subtitle={configSummary} accent>
          <ConfigPanel config={config} update={updateConfig} />
        </Accordion>

        <Accordion title="Activity Log" subtitle={`${useHarvestStore.getState().log.length} events`}>
          <ActivityLog maxH={220} />
        </Accordion>
      </div>
    );
  }

  // ── DESKTOP ─────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            Harvest Engine
            {config.enabled && (
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 100, fontWeight: 700,
                background: running ? 'rgba(245,197,66,0.12)' : 'rgba(0,212,160,0.12)',
                color: running ? 'var(--accent-yellow)' : 'var(--accent-green)',
                border: `1px solid ${running ? 'rgba(245,197,66,0.3)' : 'rgba(0,212,160,0.25)'}`,
              }}>
                {running ? '⟳ Running cycle…' : '● Active'}
              </span>
            )}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Delta-neutral funding rate harvesting. Engine runs every 30s on each rate refresh.
            {lastRunAt > 0 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                Last: {new Date(lastRunAt).toLocaleTimeString()}
                {minsToNext !== null && ` · next in ~${minsToNext}m`}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <NextFundingCountdown />
          <MainToggle enabled={config.enabled} canEnable={canEnable} running={running} onToggle={toggle} onRequestArm={() => setShowArmModal(true)} />
        </div>
      </div>

      {/* Wallet warning */}
      {!wallet.connected && (
        <div style={{ background: 'rgba(255,79,110,0.08)', border: '1px solid rgba(255,79,110,0.25)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent-red)' }}>Wallet not connected.</strong> Connect in Settings. Agent Key required for automated order placement.
          </p>
        </div>
      )}

      {/* Status bar (Phase 2) */}
      <HarvestStatusBar />

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>

        {/* Left — collapsible config + best pair */}
        <div>
          {/* Collapsible config panel */}
          <div className="glass-card" style={{ marginBottom: 'var(--sp-3)', overflow: 'hidden' }}>
            <button
              onClick={() => document.getElementById('config-body')?.classList.toggle('hidden')}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: 'var(--sp-4)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--hl-teal)' }}>Engine Config</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>{configSummary}</span>
            </button>
            <div style={{ padding: '0 var(--sp-4) var(--sp-4)', borderTop: '1px solid var(--glass-border)' }}>
              <ConfigPanel config={config} update={updateConfig} />
            </div>
          </div>

          {bestPair && (
            <div className="glass-card" style={{ padding: 'var(--sp-4)', borderColor: 'rgba(67,232,216,0.2)' }}>
              <p style={{ fontSize: 11, color: 'var(--hl-teal)', fontWeight: 600, marginBottom: 'var(--sp-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ⚡ Best Opportunity
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{bestPair.symbol}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bestPair.category} · OI {formatUSD(bestPair.openInterest)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`rate-badge ${bestPair.heat}`}>{formatRateRaw(bestPair.currentRate)}/hr</span>
                  <p style={{ fontSize: 11, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    +{formatUSD(bestPair.currentRate * config.capitalPerPosition / 2)}/hr est.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right — positions + log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
              Active Positions ({positions.length})
            </p>
            {positions.length === 0 ? (
              <p style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {config.enabled ? 'Watching for entries — conditions not yet met' : 'Enable auto-trader to start opening positions'}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-3)' }}>
                {positions.map(pos => <PositionCard key={pos.id} pos={pos} />)}
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <ActivityLog maxH={300} />
          </div>

          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(67,232,216,0.04)', border: '1px solid rgba(67,232,216,0.1)', borderRadius: 'var(--r-md)', alignItems: 'flex-start' }}>
            <Info size={13} color="var(--hl-teal)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Every 30s: <strong style={{ color: 'var(--text-primary)' }}>regime check</strong> → <strong style={{ color: 'var(--text-primary)' }}>exits</strong> → <strong style={{ color: 'var(--text-primary)' }}>circuit breaker</strong> → <strong style={{ color: 'var(--text-primary)' }}>rotations</strong> → <strong style={{ color: 'var(--text-primary)' }}>new entries</strong>. Agent Key required for live orders.
            </p>
          </div>
        </div>
      </div>

      {/* P0-09: arm confirmation modal — mounted at root of page so it overlays everything */}
      {showArmModal && (
        <ArmEngineModal onClose={() => setShowArmModal(false)} />
      )}
    </div>
  );
};

export default Harvest;
