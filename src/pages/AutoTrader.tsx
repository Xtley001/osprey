import React, { useState } from 'react';
import { useAutoTraderStore } from '../store/autoTraderStore';
import { useAppStore } from '../store/appStore';
import { usePositionStore } from '../store/positionStore';
import { useScannerStore } from '../store/scannerStore';
import { formatUSD, formatRateRaw, formatDuration } from '../utils/format';
import { Zap, ZapOff, Trash2, AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useBreakpoint } from '../hooks/useBreakpoint';

// ── Slider + number input row ─────────────────────────────────────────────────
// Slider for quick drag, number field for precise keyboard entry.
// They stay perfectly in sync — editing one updates the other.
const ConfigRow: React.FC<{
  label: string;
  value: number;
  display?: string;        // formatted label value (e.g. "$1,000", "0.040%/hr")
  inputDisplay?: number;   // raw number shown in the input (after scale)
  inputUnit?: string;      // unit appended after the input (e.g. "%/hr", "h", "USDC")
  min: number; max: number; step: number;
  inputMin?: number; inputMax?: number; inputStep?: number;
  scale?: number;          // divide input value by this to get store value (e.g. 100 for %)
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
      {/* Label row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
        {/* Compact number input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min={iMin} max={iMax} step={iStep}
            value={rawInput}
            onChange={e => handleInput(e.target.value)}
            onBlur={e => handleInput(e.target.value)}
            style={{
              width: 80, height: 28,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--hl-teal)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12, fontWeight: 700,
              textAlign: 'right',
              padding: '0 6px',
              outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--hl-teal)')}
          />
          {inputUnit && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{inputUnit}</span>}
        </div>
      </div>
      {/* Slider */}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--hl-teal)', cursor: 'pointer' }}
      />
    </div>
  );
};

// ── Toggle switch (ON/OFF pill) ───────────────────────────────────────────────
const ToggleSwitch: React.FC<{ on: boolean; onChange: () => void; label: string; desc: string }> = ({ on, onChange, label, desc }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--glass-border)' }}>
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</p>
    </div>
    <button
      onClick={onChange}
      style={{
        flexShrink: 0,
        width: 44, height: 24, borderRadius: 12,
        background: on ? 'var(--accent-green)' : 'var(--bg-elevated)',
        border: `1px solid ${on ? 'var(--accent-green)' : 'var(--glass-border)'}`,
        cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
        padding: 0,
      }}
      aria-label={`Toggle ${label}`}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 22 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: on ? '#0a0b0f' : 'var(--text-muted)',
        transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  </div>
);

// ── Activity log ──────────────────────────────────────────────────────────────
const ActivityLog: React.FC<{ maxH?: number }> = ({ maxH = 280 }) => {
  const log      = useAutoTraderStore(s => s.log);
  const clearLog = useAutoTraderStore(s => s.clearLog);
  const colors   = { ENTRY: 'var(--accent-green)', EXIT: 'var(--accent-yellow)', ROTATE: 'var(--hl-teal)', SKIP: 'var(--text-muted)', ERROR: 'var(--accent-red)', INFO: 'var(--text-secondary)' };
  const icons    = { ENTRY: '↗', EXIT: '↙', ROTATE: '↻', SKIP: '–', ERROR: '⚠', INFO: '·' };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activity Log</p>
        {log.length > 0 && (
          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={clearLog}>
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>
      {log.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
          No activity yet — enable auto-trader to start.
        </p>
      ) : (
        <div style={{ maxHeight: maxH, overflowY: 'auto' }}>
          {log.map(entry => (
            <div key={entry.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
              <span style={{ color: colors[entry.type], fontSize: 13, fontWeight: 700, flexShrink: 0, width: 16, textAlign: 'center', lineHeight: 1.3 }}>
                {icons[entry.type]}
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
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', gap: 8,
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: accent ? 'var(--hl-teal)' : 'var(--text-primary)' }}>{title}</p>
          {subtitle && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</p>}
        </div>
        {open
          ? <ChevronUp size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          : <ChevronDown size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        }
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {children}
        </div>
      )}
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
          ['Notional', formatUSD(pos.notional),        'var(--text-primary)'],
          ['Held',     formatDuration(pos.hoursHeld),  'var(--text-primary)'],
          ['Earned',   '+' + formatUSD(pos.fundingEarned), 'var(--accent-green)'],
          ['Net P&L',  (net >= 0 ? '+' : '') + formatUSD(net), net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'],
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

// ── Main toggle button — pill shaped, not square ──────────────────────────────
const MainToggle: React.FC<{ enabled: boolean; canEnable: boolean; running: boolean; onToggle: () => void; fullWidth?: boolean }> = ({
  enabled, canEnable, running, onToggle, fullWidth,
}) => {
  const Icon = enabled ? ZapOff : Zap;
  return (
    <button
      onClick={() => canEnable && onToggle()}
      disabled={!canEnable}
      aria-label={enabled ? 'Stop Auto-Trader' : 'Start Auto-Trader'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingTop: 0, paddingBottom: 0,
        height: fullWidth ? 52 : 40,
        paddingLeft: fullWidth ? 24 : 22,
        paddingRight: fullWidth ? 24 : 22,
        width: fullWidth ? '100%' : 'auto',
        borderRadius: 100, // pill
        border: enabled ? '1.5px solid rgba(255,79,110,0.4)' : '1.5px solid transparent',
        background: enabled
          ? 'rgba(255,79,110,0.12)'
          : canEnable
            ? 'var(--accent-green)'
            : 'var(--bg-elevated)',
        color: enabled
          ? 'var(--accent-red)'
          : canEnable ? '#0a0b0f' : 'var(--text-muted)',
        cursor: canEnable ? 'pointer' : 'not-allowed',
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: fullWidth ? 16 : 14,
        letterSpacing: '-0.01em',
        transition: 'all 0.2s',
        boxShadow: (!enabled && canEnable) ? '0 0 20px rgba(0,212,160,0.25)' : 'none',
      }}
    >
      <Icon size={fullWidth ? 18 : 16} />
      {enabled ? (running ? 'Running…' : 'Stop') : 'Start Auto-Trader'}
    </button>
  );
};

// ── Config panel shared between mobile + desktop ──────────────────────────────
const ConfigPanel: React.FC<{
  config: ReturnType<typeof useAutoTraderStore.getState>['config'];
  update: (d: Partial<ReturnType<typeof useAutoTraderStore.getState>['config']>) => void;
}> = ({ config, update }) => (
  <>
    <ConfigRow
      label="Capital per position"  inputUnit="USDC"
      value={config.capitalPerPosition} inputDisplay={config.capitalPerPosition}
      min={100} max={50000} step={100}
      onChange={v => update({ capitalPerPosition: v })}
    />
    <ConfigRow
      label="Max open positions"
      value={config.maxPositions} inputDisplay={config.maxPositions}
      min={1} max={5} step={1}
      onChange={v => update({ maxPositions: v })}
    />
    <ConfigRow
      label="Entry rate threshold"  inputUnit="%/hr"  scale={100}
      value={config.entryThreshold}
      inputDisplay={parseFloat((config.entryThreshold * 100).toFixed(4))}
      min={0.0001} max={0.005} step={0.0001}
      inputMin={0.01} inputMax={0.5} inputStep={0.001}
      onChange={v => update({ entryThreshold: v })}
    />
    <ConfigRow
      label="Exit rate threshold"   inputUnit="%/hr"  scale={100}
      value={config.exitThreshold}
      inputDisplay={parseFloat((config.exitThreshold * 100).toFixed(4))}
      min={0.00005} max={0.002} step={0.00005}
      inputMin={0.005} inputMax={0.2} inputStep={0.001}
      onChange={v => update({ exitThreshold: v })}
    />
    <ConfigRow
      label="Min hours elevated"    inputUnit="hrs"
      value={config.minHoursElevated} inputDisplay={config.minHoursElevated}
      min={1} max={6} step={1}
      onChange={v => update({ minHoursElevated: v })}
    />
    <ConfigRow
      label="Max hold time"         inputUnit="hrs"
      value={config.maxHoldHours} inputDisplay={config.maxHoldHours}
      min={6} max={168} step={6}
      onChange={v => update({ maxHoldHours: v })}
    />
    <ConfigRow
      label="Min open interest"     inputUnit="USDC"
      value={config.minOI} inputDisplay={config.minOI}
      min={100000} max={10000000} step={100000}
      inputStep={100000}
      onChange={v => update({ minOI: v })}
    />
    <div style={{ marginTop: 4 }}>
      <ToggleSwitch on={config.rotationEnabled} onChange={() => update({ rotationEnabled: !config.rotationEnabled })} label="Auto-rotate" desc="Move to higher-rate pair when profitable after fees" />
      <ToggleSwitch on={config.regimeGate} onChange={() => update({ regimeGate: !config.regimeGate })} label="Regime gate" desc="Pause new entries when market is COLD" />
    </div>
  </>
);

// ── Page ──────────────────────────────────────────────────────────────────────
const AutoTrader: React.FC = () => {
  const { config, running, lastRunAt, nextRunAt, totalAutoEarned, totalAutoFees, updateConfig, toggle } = useAutoTraderStore();
  const mode      = useAppStore(s => s.mode);
  const wallet    = useAppStore(s => s.wallet);
  const positions = usePositionStore(s => s.positions);
  const pairs     = useScannerStore(s => s.pairs);
  const regime    = useAppStore(s => s.regime);
  const { isMobile } = useBreakpoint();

  const autoPositions = positions.filter(p => p.isDemo === (mode === 'demo'));
  const netProfit     = totalAutoEarned - totalAutoFees;
  const bestPair      = [...pairs]
    .filter(p => p.currentRate >= config.entryThreshold && p.openInterest >= config.minOI)
    .sort((a, b) => b.currentRate - a.currentRate)[0];
  const canEnable     = mode === 'demo' || (mode === 'real' && wallet.connected);
  const minsToNext    = nextRunAt > 0 ? Math.max(0, Math.round((nextRunAt - Date.now()) / 60000)) : null;

  const regimeEmoji   = regime.label === 'HOT' ? '🔥' : regime.label === 'NEUTRAL' ? '🌤' : '🧊';
  const regimeColor   = regime.label === 'HOT' ? 'var(--accent-orange)' : regime.label === 'NEUTRAL' ? 'var(--hl-teal)' : 'var(--text-muted)';

  // ── MOBILE ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="fade-in" style={{ paddingTop: 'var(--sp-3)', paddingBottom: 80 }}>

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, lineHeight: 1 }}>
              Auto-Trader
            </h1>
            {lastRunAt > 0 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                Last: {new Date(lastRunAt).toLocaleTimeString()}
                {minsToNext !== null && ` · next ~${minsToNext}m`}
              </p>
            )}
          </div>
          {/* Status pill — only shown when active */}
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

        {/* ── Wallet warning ── */}
        {mode === 'real' && !wallet.connected && (
          <div style={{
            background: 'rgba(255,79,110,0.08)', border: '1px solid rgba(255,79,110,0.25)',
            borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 'var(--sp-3)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={14} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--accent-red)' }}>Wallet not connected.</strong>{' '}
              Go to Settings to connect MetaMask.
            </p>
          </div>
        )}

        {/* ── Stats row — 4 equal tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 'var(--sp-3)' }}>
          {[
            { label: 'Regime',  value: `${regimeEmoji}`, sub: regime.label, color: regimeColor },
            { label: 'Open',    value: `${autoPositions.length}/${config.maxPositions}`, color: 'var(--text-primary)' },
            { label: 'Earned',  value: formatUSD(totalAutoEarned), color: 'var(--accent-green)' },
            { label: 'Net',     value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-md)', padding: '8px 6px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</p>
              {'sub' in s && s.sub && <p style={{ fontSize: 9, color: s.color, marginTop: 1 }}>{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Main toggle — full-width pill ── */}
        <div style={{ marginBottom: 'var(--sp-3)' }}>
          <MainToggle enabled={config.enabled} canEnable={canEnable} running={running} onToggle={toggle} fullWidth />
        </div>

        {/* ── Best opportunity ── */}
        {bestPair && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(67,232,216,0.2)',
            borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 'var(--sp-3)',
          }}>
            <p style={{ fontSize: 10, color: 'var(--hl-teal)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              ⚡ Best Opportunity Now
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>{bestPair.symbol}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bestPair.category} · OI {formatUSD(bestPair.openInterest)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`rate-badge ${bestPair.heat}`} style={{ fontSize: 13 }}>{formatRateRaw(bestPair.currentRate)}/hr</span>
                <p style={{ fontSize: 11, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>
                  +{formatUSD(bestPair.currentRate * config.capitalPerPosition / 2)}/hr est.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Active positions — open by default only if there are positions ── */}
        {autoPositions.length > 0 ? (
          <Accordion
            title={`Active Positions (${autoPositions.length})`}
            subtitle={`+${formatUSD(autoPositions.reduce((s, p) => s + p.fundingEarned, 0))} accruing`}
            defaultOpen={true}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {autoPositions.map(pos => <PositionCard key={pos.id} pos={pos} />)}
            </div>
          </Accordion>
        ) : (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 10,
            textAlign: 'center', color: 'var(--text-muted)', fontSize: 12,
          }}>
            {config.enabled
              ? 'Watching for opportunities — will enter when conditions are met'
              : 'Tap Start Auto-Trader to begin'}
          </div>
        )}

        {/* ── Strategy config — collapsed ── */}
        <Accordion title="Strategy Settings" subtitle="Tap to configure thresholds & limits" defaultOpen={false} accent>
          <ConfigPanel config={config} update={updateConfig} />
        </Accordion>

        {/* ── Activity log — collapsed ── */}
        <Accordion
          title="Activity Log"
          subtitle={autoPositions.length > 0 || useAutoTraderStore.getState().log.length > 0 ? `${useAutoTraderStore.getState().log.length} events` : 'No events yet'}
          defaultOpen={false}
        >
          <ActivityLog maxH={220} />
        </Accordion>

      </div>
    );
  }

  // ── DESKTOP ─────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            Auto-Trader
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
            Enters, manages, and exits positions automatically every 60s.
            {lastRunAt > 0 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                Last: {new Date(lastRunAt).toLocaleTimeString()}
                {minsToNext !== null && ` · next in ~${minsToNext}m`}
              </span>
            )}
          </p>
        </div>
        <MainToggle enabled={config.enabled} canEnable={canEnable} running={running} onToggle={toggle} />
      </div>

      {/* Wallet warning */}
      {mode === 'real' && !wallet.connected && (
        <div style={{ background: 'rgba(255,79,110,0.08)', border: '1px solid rgba(255,79,110,0.25)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent-red)' }}>Wallet not connected.</strong> Connect MetaMask in Settings before enabling live auto-trading.
          </p>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid-stats" style={{ marginBottom: 'var(--sp-5)' }}>
        {[
          { label: 'Regime',     value: `${regimeEmoji} ${regime.label}`, color: regimeColor },
          { label: 'Positions',  value: `${autoPositions.length} / ${config.maxPositions}`, color: 'var(--text-primary)' },
          { label: 'Earned',     value: '+' + formatUSD(totalAutoEarned), color: 'var(--accent-green)' },
          { label: 'Fees',       value: '−' + formatUSD(totalAutoFees),   color: 'var(--accent-red)' },
          { label: 'Net Profit', value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
        ].map(s => (
          <div key={s.label} className="glass-card" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>

        {/* Left — config + best pair */}
        <div>
          <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--hl-teal)', marginBottom: 'var(--sp-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Strategy Configuration
            </p>
            <ConfigPanel config={config} update={updateConfig} />
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

          {/* Active positions */}
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
              Active Positions ({autoPositions.length})
            </p>
            {autoPositions.length === 0 ? (
              <p style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {config.enabled ? 'Watching for entries — conditions not yet met' : 'Enable auto-trader to start opening positions'}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-3)' }}>
                {autoPositions.map(pos => <PositionCard key={pos.id} pos={pos} />)}
              </div>
            )}
          </div>

          {/* Activity log */}
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <ActivityLog maxH={300} />
          </div>

          {/* How it works — compact inline info, not a paragraph wall */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(67,232,216,0.04)', border: '1px solid rgba(67,232,216,0.1)', borderRadius: 'var(--r-md)', alignItems: 'flex-start' }}>
            <Info size={13} color="var(--hl-teal)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Every 60s: <strong style={{ color: 'var(--text-primary)' }}>regime check</strong> → <strong style={{ color: 'var(--text-primary)' }}>exits</strong> → <strong style={{ color: 'var(--text-primary)' }}>rotations</strong> → <strong style={{ color: 'var(--text-primary)' }}>new entries</strong>. Demo uses live rates with no real capital. Live requires MetaMask.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoTrader;
