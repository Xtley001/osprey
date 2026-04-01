import React from 'react';
import { useAutoTraderStore } from '../store/autoTraderStore';
import { useAppStore } from '../store/appStore';
import { usePositionStore } from '../store/positionStore';
import { useScannerStore } from '../store/scannerStore';
import { formatUSD, formatRateRaw, formatDuration } from '../utils/format';
import { Power, RefreshCw, Trash2, AlertTriangle, TrendingUp, Zap } from 'lucide-react';

// ── Config row helper ─────────────────────────────────────────────────────────
const ConfigRow: React.FC<{
  label:    string;
  value:    number;
  display?: string;
  min:      number;
  max:      number;
  step:     number;
  onChange: (v: number) => void;
  hint?:    string;
}> = ({ label, value, display, min, max, step, onChange, hint }) => (
  <div style={{ marginBottom: 'var(--sp-4)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</label>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
        {display ?? value}
      </span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', accentColor: 'var(--hl-teal)' }}
    />
    {hint && <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</p>}
  </div>
);

// ── Activity log ─────────────────────────────────────────────────────────────
const ActivityLog: React.FC = () => {
  const log      = useAutoTraderStore(s => s.log);
  const clearLog = useAutoTraderStore(s => s.clearLog);

  const colors = {
    ENTRY:  'var(--accent-green)',
    EXIT:   'var(--accent-yellow)',
    ROTATE: 'var(--hl-teal)',
    SKIP:   'var(--text-muted)',
    ERROR:  'var(--accent-red)',
    INFO:   'var(--text-secondary)',
  };

  const icons = {
    ENTRY:  '↗',
    EXIT:   '↙',
    ROTATE: '↻',
    SKIP:   '–',
    ERROR:  '⚠',
    INFO:   'i',
  };

  return (
    <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Activity Log
        </p>
        {log.length > 0 && (
          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={clearLog}>
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {log.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
          No activity yet. Enable the auto-trader to start.
        </p>
      ) : (
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {log.map(entry => (
            <div key={entry.id} style={{
              display: 'flex', gap: 10, padding: '6px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              alignItems: 'flex-start',
            }}>
              <span style={{ color: colors[entry.type], fontSize: 12, fontWeight: 700, flexShrink: 0, width: 14, textAlign: 'center' }}>
                {icons[entry.type]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {entry.symbol && <strong style={{ color: 'var(--text-primary)', marginRight: 5 }}>{entry.symbol}</strong>}
                    {entry.message}
                  </span>
                  {entry.rate !== undefined && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {(entry.rate * 100).toFixed(4)}%
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {entry.pnl !== undefined && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, flexShrink: 0,
                  color: entry.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                  {entry.pnl >= 0 ? '+' : ''}{formatUSD(entry.pnl)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const AutoTrader: React.FC = () => {
  const { config, running, lastRunAt, nextRunAt, totalAutoEarned, totalAutoFees, updateConfig, toggle } = useAutoTraderStore();
  const mode      = useAppStore(s => s.mode);
  const wallet    = useAppStore(s => s.wallet);
  const positions = usePositionStore(s => s.positions);
  const pairs     = useScannerStore(s => s.pairs);
  const regime    = useAppStore(s => s.regime);

  const autoPositions = positions.filter(p => p.isDemo === (mode === 'demo'));
  const netProfit     = totalAutoEarned - totalAutoFees;

  // Best available pair right now
  const bestPair = [...pairs]
    .filter(p => p.currentRate >= config.entryThreshold && p.openInterest >= config.minOI)
    .sort((a, b) => b.currentRate - a.currentRate)[0];

  const canEnable = mode === 'demo' || (mode === 'real' && wallet.connected);

  const minsToNext = nextRunAt > 0
    ? Math.max(0, Math.round((nextRunAt - Date.now()) / 60000))
    : null;

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            Auto-Trader
            {config.enabled && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-sm)', fontWeight: 700,
                background: running ? 'rgba(245,197,66,0.15)' : 'rgba(0,212,160,0.15)',
                color:      running ? 'var(--accent-yellow)'   : 'var(--accent-green)',
                border: `1px solid ${running ? 'rgba(245,197,66,0.3)' : 'rgba(0,212,160,0.3)'}`,
                animation: running ? 'pulse-hot 1.5s ease-in-out infinite' : 'none',
              }}>
                {running ? '⟳ Running cycle…' : '● Active'}
              </span>
            )}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Automatically enters, manages, and exits positions based on your strategy parameters.
            {lastRunAt > 0 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                Last run {new Date(lastRunAt).toLocaleTimeString()}
                {minsToNext !== null && ` · next in ~${minsToNext}m`}
              </span>
            )}
          </p>
        </div>

        {/* Master toggle */}
        <button
          onClick={() => canEnable && toggle()}
          disabled={!canEnable}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 'var(--r-md)', border: 'none',
            background: config.enabled
              ? 'rgba(255,79,110,0.15)'
              : canEnable ? 'var(--accent-green)' : 'var(--bg-elevated)',
            color: config.enabled
              ? 'var(--accent-red)'
              : canEnable ? '#0a0b0f' : 'var(--text-muted)',
            cursor: canEnable ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
            outline: config.enabled ? '1px solid rgba(255,79,110,0.3)' : 'none',
            transition: 'all var(--t-normal)',
          }}
        >
          <Power size={16} />
          {config.enabled ? 'Stop Auto-Trader' : 'Start Auto-Trader'}
        </button>
      </div>

      {/* Real mode wallet warning */}
      {mode === 'real' && !wallet.connected && (
        <div style={{ background: 'rgba(255,79,110,0.1)', border: '1px solid rgba(255,79,110,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={14} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent-red)' }}>Wallet not connected.</strong>{' '}
            Connect MetaMask in Settings before enabling auto-trader in Live mode.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid-stats" style={{ marginBottom: 'var(--sp-5)' }}>
        {[
          { label: 'Regime',           value: `${regime.label === 'HOT' ? '🔥' : regime.label === 'NEUTRAL' ? '🌤' : '🧊'} ${regime.label}`, color: regime.label === 'HOT' ? 'var(--accent-orange)' : regime.label === 'NEUTRAL' ? 'var(--hl-teal)' : 'var(--text-muted)' },
          { label: 'Active Positions', value: String(autoPositions.length) + ' / ' + config.maxPositions, color: 'var(--text-primary)' },
          { label: 'Auto Earned',      value: '+' + formatUSD(totalAutoEarned), color: 'var(--accent-green)' },
          { label: 'Auto Fees',        value: '−' + formatUSD(totalAutoFees),   color: 'var(--accent-red)' },
          { label: 'Net Profit',       value: (netProfit >= 0 ? '+' : '') + formatUSD(netProfit), color: netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
        ].map(s => (
          <div key={s.label} className="glass-card" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--sp-4)', alignItems: 'start' }}>
        {/* Config panel */}
        <div>
          <div className="glass-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--hl-teal)', marginBottom: 'var(--sp-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Strategy Configuration
            </p>

            <ConfigRow
              label="Capital per position (USDC)"
              value={config.capitalPerPosition}
              display={formatUSD(config.capitalPerPosition)}
              min={100} max={50000} step={100}
              onChange={v => updateConfig({ capitalPerPosition: v })}
              hint="Each position uses this amount split equally across perp and spot legs"
            />
            <ConfigRow
              label="Max concurrent positions"
              value={config.maxPositions}
              min={1} max={5} step={1}
              onChange={v => updateConfig({ maxPositions: v })}
              hint="Auto-trader won't open more than this many positions at once"
            />
            <ConfigRow
              label="Entry rate threshold"
              value={config.entryThreshold}
              display={`${(config.entryThreshold * 100).toFixed(3)}%/hr`}
              min={0.0001} max={0.005} step={0.0001}
              onChange={v => updateConfig({ entryThreshold: v })}
              hint="Only enter when rate is above this. Lower = more trades, higher = only best opportunities"
            />
            <ConfigRow
              label="Exit rate threshold"
              value={config.exitThreshold}
              display={`${(config.exitThreshold * 100).toFixed(3)}%/hr`}
              min={0.00005} max={0.002} step={0.00005}
              onChange={v => updateConfig({ exitThreshold: v })}
              hint="Exit when rate drops below this level"
            />
            <ConfigRow
              label="Min hours elevated before entry"
              value={config.minHoursElevated}
              min={1} max={6} step={1}
              onChange={v => updateConfig({ minHoursElevated: v })}
              hint="Require rate to be elevated for N consecutive hours before entering. Reduces false entries."
            />
            <ConfigRow
              label="Max hold hours"
              value={config.maxHoldHours}
              display={formatDuration(config.maxHoldHours)}
              min={6} max={168} step={6}
              onChange={v => updateConfig({ maxHoldHours: v })}
              hint="Force-exit after this many hours regardless of rate"
            />
            <ConfigRow
              label="Min open interest (liquidity filter)"
              value={config.minOI}
              display={formatUSD(config.minOI)}
              min={100000} max={10000000} step={100000}
              onChange={v => updateConfig({ minOI: v })}
              hint="Skip pairs with OI below this — low OI means wide spreads and slippage"
            />

            {/* Toggle switches */}
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              {[
                { key: 'rotationEnabled' as const, label: 'Rotation', desc: 'Move to higher-rate pair when profitable after fees' },
                { key: 'regimeGate'      as const, label: 'Regime gate', desc: 'Pause new entries in COLD regime' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{label}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                  <button
                    onClick={() => updateConfig({ [key]: !config[key] })}
                    style={{
                      background: config[key] ? 'var(--accent-green)' : 'var(--bg-elevated)',
                      color: config[key] ? '#0a0b0f' : 'var(--text-muted)',
                      border: 'none', borderRadius: 'var(--r-sm)', padding: '3px 10px',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)',
                    }}
                  >
                    {config[key] ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Best opportunity now */}
          {bestPair && (
            <div className="glass-card" style={{ padding: 'var(--sp-4)', borderColor: 'var(--glass-border-hl)' }}>
              <p style={{ fontSize: 11, color: 'var(--hl-teal)', fontWeight: 600, marginBottom: 'var(--sp-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Best Opportunity Now
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 16 }}>{bestPair.symbol}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{bestPair.category} · OI {formatUSD(bestPair.openInterest)}</p>
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

        {/* Right column: active positions + log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

          {/* Active auto positions */}
          <div className="glass-card" style={{ padding: 'var(--sp-4)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-3)' }}>
              Active Positions ({autoPositions.length})
            </p>
            {autoPositions.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {config.enabled
                  ? 'No positions open yet — auto-trader will enter when conditions are met'
                  : 'Enable auto-trader to start opening positions automatically'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-3)' }}>
                {autoPositions.map(pos => {
                  const net = pos.fundingEarned - pos.feesPaid;
                  const hourlyEst = pos.currentRate * pos.notional;
                  return (
                    <div key={pos.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{pos.symbol}</span>
                        <span className={`rate-badge ${pos.currentRate > 0.0005 ? 'hot' : 'cold'}`} style={{ fontSize: 10, padding: '1px 5px' }}>
                          {formatRateRaw(pos.currentRate)}/hr
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 11 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Notional</span>
                        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{formatUSD(pos.notional)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>Earned</span>
                        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--accent-green)' }}>+{formatUSD(pos.fundingEarned)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>Net PnL</span>
                        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {net >= 0 ? '+' : ''}{formatUSD(net)}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>Per hour</span>
                        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--accent-green)', fontSize: 10 }}>+{formatUSD(hourlyEst)}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>Held</span>
                        <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{formatDuration(pos.hoursHeld)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ActivityLog />

          {/* How it works */}
          <div style={{ background: 'rgba(67,232,216,0.04)', border: '1px solid rgba(67,232,216,0.12)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', fontSize: 12 }}>
            <p style={{ color: 'var(--hl-teal)', fontWeight: 600, marginBottom: 8 }}>How auto-trader works</p>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p>Every time rates refresh (every 60s), the auto-trader runs a cycle:</p>
              <ol style={{ paddingLeft: 16, marginTop: 6 }}>
                <li>Check regime — if COLD and regime gate is ON, no new entries</li>
                <li>Check exits — close any position where rate dropped below exit threshold or max hold reached</li>
                <li>Check rotations — if a better-rate pair exists and rotation fee breaks even within 3h, rotate</li>
                <li>Check entries — find pairs above entry threshold with confirmed signal, enter up to max positions</li>
              </ol>
              <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                Demo mode simulates trades with live rates. Live mode requires a connected MetaMask wallet and submits real orders to Hyperliquid.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoTrader;
