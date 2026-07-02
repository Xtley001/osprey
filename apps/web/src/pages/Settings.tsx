import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Shield, RefreshCw, AlertTriangle, Loader, Bell, Download } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useHarvestStore } from '../store/harvestStore';
import { usePositionStore } from '../store/positionStore';
import { formatUSD } from '@osprey/engine';
import { toast } from '../components/shared/Toast';
import { fetchAccountState } from '@osprey/engine';

const WALLET_STORAGE_KEY = 'osprey_wallet_v1';

function saveWalletSession(address: string) {
  try { localStorage.setItem(WALLET_STORAGE_KEY, address); } catch (_e) { /* ignore */ }
}
function clearWalletSession() {
  try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch (_e) { /* ignore */ }
}
function getSavedWalletAddress(): string | null {
  try { return localStorage.getItem(WALLET_STORAGE_KEY); } catch { return null; }
}

// ── Risk limit row ─────────────────────────────────────────────────────────────
const RiskLimitRow: React.FC<{
  label: string; description: string;
  value: number; unit: string; min: number; max: number; step: number;
  onChange: (v: number) => void;
}> = ({ label, description, value, unit, min, max, step, onChange }) => (
  <div style={{ padding: '10px 0', borderBottom: '1px solid var(--glass-border)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <div style={{ minWidth: 0, paddingRight: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.4 }}>{description}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <input
          type="number" min={min} max={max} step={step} value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          style={{
            width: 64, height: 30, background: 'var(--bg-elevated)',
            border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)',
            color: 'var(--hl-teal)', fontFamily: 'var(--font-mono)', fontSize: 13,
            fontWeight: 700, textAlign: 'right', padding: '0 6px', outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--hl-teal)')}
          onBlur={e => (e.target.style.borderColor = 'var(--glass-border)')}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{unit}</span>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      {[0, ...[min, max * 0.25, max * 0.5, max].map(v => Math.round(v / step) * step)].filter((v, i, a) => a.indexOf(v) === i).map(preset => (
        <button key={preset} onClick={() => onChange(preset)} style={{
          padding: '2px 8px', borderRadius: 'var(--r-sm)', fontSize: 10, fontWeight: 600,
          border: `1px solid ${value === preset ? 'var(--hl-teal)' : 'var(--glass-border)'}`,
          background: value === preset ? 'var(--hl-teal-dim)' : 'transparent',
          color: value === preset ? 'var(--hl-teal)' : 'var(--text-muted)',
          cursor: 'pointer',
        }}>{preset === 0 ? 'Off' : `${preset}${unit}`}</button>
      ))}
    </div>
  </div>
);

// ── Notification toggle ────────────────────────────────────────────────────────
const NOTIF_KEY = 'osprey_notif_prefs_v1';
function loadNotifPrefs(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '{}'); } catch { return {}; }
}
function saveNotifPrefs(prefs: Record<string, boolean>) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

const NotifToggle: React.FC<{ label: string; description: string; storageKey: string }> = ({ label, description, storageKey }) => {
  const [enabled, setEnabled] = useState(() => loadNotifPrefs()[storageKey] ?? false);

  const toggle = useCallback(async () => {
    if (!enabled && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.warning('Notifications blocked by browser. Enable in browser settings.');
        return;
      }
    }
    const next = !enabled;
    setEnabled(next);
    const prefs = loadNotifPrefs();
    prefs[storageKey] = next;
    saveNotifPrefs(prefs);
  }, [enabled, storageKey]);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--glass-border)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{description}</p>
      </div>
      <button onClick={toggle} style={{
        flexShrink: 0, width: 44, height: 24, borderRadius: 12,
        background: enabled ? 'var(--accent-green)' : 'var(--bg-elevated)',
        border: `1px solid ${enabled ? 'var(--accent-green)' : 'var(--glass-border)'}`,
        cursor: 'pointer', position: 'relative', transition: 'all 0.2s', padding: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: enabled ? 22 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: enabled ? '#0a0b0f' : 'var(--text-muted)',
          transition: 'left 0.2s', display: 'block',
        }} />
      </button>
    </div>
  );
};

// ── Main Settings page ─────────────────────────────────────────────────────────
const Settings: React.FC = () => {
  const wallet      = useAppStore(s => s.wallet);
  const setWallet   = useAppStore(s => s.setWallet);
  const config      = useHarvestStore(s => s.config);
  const updateConfig = useHarvestStore(s => s.updateConfig);
  const trades      = usePositionStore(s => s.trades);

  const [connecting,        setConnecting]        = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [emailWebhook,      setEmailWebhook]      = useState(() => {
    try { return localStorage.getItem('osprey_email_webhook') ?? ''; } catch { return ''; }
  });

  // Auto-reconnect on page load
  useEffect(() => {
    const savedAddress = getSavedWalletAddress();
    if (!savedAddress || wallet.connected) return;

    const eth = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) return;

    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
      if (accounts[0]?.toLowerCase() === savedAddress.toLowerCase()) {
        setWallet({ address: savedAddress, connected: true });
        fetchAccountState(savedAddress).then(state => {
          if (state) setWallet({ balance: state.balance });
        });
      } else {
        clearWalletSession();
      }
    }).catch(() => clearWalletSession());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MetaMask account change listeners
  useEffect(() => {
    const eth = (window as Window & { ethereum?: { on: (e: string, cb: (a: string[]) => void) => void; removeListener: (e: string, cb: (a: string[]) => void) => void } }).ethereum;
    if (!eth) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        clearWalletSession();
        setWallet({ address: null, connected: false, balance: 0 });
        toast.info('Wallet disconnected in MetaMask');
      } else if (accounts[0] !== wallet.address) {
        const newAddress = accounts[0];
        saveWalletSession(newAddress);
        setWallet({ address: newAddress, connected: true });
        fetchAccountState(newAddress).then(state => {
          if (state) setWallet({ balance: state.balance });
        });
        toast.info(`Switched to ${newAddress.slice(0, 6)}…${newAddress.slice(-4)}`);
      }
    };

    eth.on('accountsChanged', handleAccountsChanged);
    return () => { eth.removeListener('accountsChanged', handleAccountsChanged); };
  }, [wallet.address, setWallet]);

  const connectWallet = async () => {
    const eth = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) {
      toast.error('No browser wallet found. Install MetaMask or configure an Agent Key.');
      return;
    }
    setConnecting(true);
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      if (!address) throw new Error('No account returned');
      saveWalletSession(address);
      setWallet({ address, connected: true, balance: 0 });
      toast.info('Wallet connected · fetching Hyperliquid balance…');
      fetchAccountState(address).then(state => {
        if (state) {
          setWallet({ balance: state.balance });
          toast.success(state.balance > 0 ? `Balance: ${formatUSD(state.balance)}` : `Connected · No HL balance found`);
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('rejected') || msg.includes('denied')) {
        toast.warning('Wallet connection cancelled.');
      } else {
        toast.error(`Connection failed: ${msg}`);
      }
    } finally {
      setConnecting(false);
    }
  };

  const refreshBalance = async () => {
    if (!wallet.address) return;
    setRefreshingBalance(true);
    try {
      const state = await fetchAccountState(wallet.address);
      if (state) {
        setWallet({ balance: state.balance });
        toast.success(`Balance updated: ${formatUSD(state.balance)}`);
      } else {
        toast.error('Could not fetch balance — check network');
      }
    } finally {
      setRefreshingBalance(false);
    }
  };

  const disconnect = () => {
    clearWalletSession();
    setWallet({ address: null, connected: false, balance: 0 });
    toast.info('Wallet disconnected');
  };

  const handleExportTradeCSV = () => {
    if (trades.length === 0) { toast.warning('No trades to export yet.'); return; }
    const rows = [
      ['Symbol', 'Entry Time', 'Exit Time', 'Hours Held', 'Avg Rate', 'Gross Funding', 'Fees', 'Net'],
      ...trades.map(t => [
        t.symbol,
        new Date(t.entryTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        t.hoursHeld.toFixed(2),
        (t.avgRate * 100).toFixed(6),
        t.grossFunding.toFixed(4),
        t.fees.toFixed(4),
        t.net.toFixed(4),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'osprey_trades.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${trades.length} trades`);
  };

  const saveEmailWebhook = () => {
    try { localStorage.setItem('osprey_email_webhook', emailWebhook); } catch { /* ignore */ }
    toast.success('Webhook URL saved');
  };

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)', maxWidth: 620, width: '100%' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 'var(--sp-5)' }}>Settings</h1>

      {/* Live mode banner */}
      <div style={{
        background: 'rgba(245,197,66,0.06)', border: '1px solid rgba(245,197,66,0.2)',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ color: 'var(--accent-yellow)', fontSize: 16, flexShrink: 0 }}>⚡</span>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent-yellow)' }}>Live Mode Only.</strong> Osprey executes against real Hyperliquid mainnet funds.
          Every order is a real order. Configure an Agent Key for automated trading — it cannot withdraw funds.
        </p>
      </div>

      {/* ── Wallet ────────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={15} color="var(--hl-teal)" /> Wallet Connection
        </p>
        {wallet.connected ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-4)' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-yellow)', marginBottom: 4, wordBreak: 'break-all' }}>{wallet.address}</p>
                <p style={{ fontSize: 11, color: 'var(--accent-green)' }}>● Connected · Hyperliquid mainnet</p>
              </div>
              <button className="btn btn-danger" style={{ padding: '5px 12px', fontSize: 11, flexShrink: 0, marginLeft: 12 }} onClick={disconnect}>Disconnect</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
              <div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Hyperliquid Balance (USDC)</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: wallet.balance > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                  {wallet.balance > 0 ? formatUSD(wallet.balance) : 'No balance found'}
                </p>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={refreshBalance} disabled={refreshingBalance}>
                {refreshingBalance ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Refresh
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
              Connect your browser wallet to authenticate. For automated trading, configure an Agent Key below.
            </p>
            <div style={{ background: 'rgba(91,141,238,0.06)', border: '1px solid rgba(91,141,238,0.15)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)', fontSize: 11, color: 'var(--accent-blue)' }}>
              New to Hyperliquid? Deposit USDC at <strong>app.hyperliquid.xyz</strong> first.
            </div>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--accent-yellow)', color: '#0a0b0f', opacity: connecting ? 0.7 : 1 }}
              onClick={connectWallet} disabled={connecting}
            >
              {connecting ? <Loader size={14} className="spin" /> : <Wallet size={14} />}
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
            <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              WalletConnect is supported for one-time Agent Key authorization only — not for placing trade orders.
            </p>
          </div>
        )}
      </div>

      {/* ── Agent Key ─────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="var(--accent-yellow)" /> Agent Key (Automated Trading)
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--sp-3)' }}>
          An Agent Key is a secondary wallet authorized by your main account to place orders. It cannot withdraw funds.
          Required for the harvest engine to execute trades automatically without browser interaction.
        </p>
        <div style={{ background: 'rgba(245,197,66,0.06)', border: '1px solid rgba(245,197,66,0.15)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 11, color: 'var(--accent-yellow)' }}>
          Generate a key → approve it in your HL account → paste the private key here.
          The key is AES-GCM encrypted in your browser before storage.
        </div>
      </div>

      {/* ── Risk Limits (Phase 3) ─────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="var(--accent-red)" /> Risk Limits
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.5 }}>
          All controls are live — changes apply to the next engine cycle. Set to 0 to disable any limit.
        </p>

        <RiskLimitRow
          label="Portfolio circuit breaker"
          description="Pause new entries if net P&L drops this % below the peak. 0 = disabled."
          value={config.maxDrawdownPct} unit="%" min={0} max={50} step={5}
          onChange={v => updateConfig({ maxDrawdownPct: v })}
        />
        <RiskLimitRow
          label="Per-pair loss limit"
          description="Auto-exit if unrealized loss exceeds this % of perp notional (capital ÷ 2). 0 = disabled."
          value={config.maxPairLossPct} unit="%" min={0} max={20} step={1}
          onChange={v => updateConfig({ maxPairLossPct: v })}
        />
        <RiskLimitRow
          label="Liquidation buffer"
          description="Pause new entries if available margin falls below this % of account equity. 0 = disabled."
          value={config.liquidationBufferPct} unit="%" min={0} max={30} step={5}
          onChange={v => updateConfig({ liquidationBufferPct: v })}
        />
      </div>

      {/* ── Notifications (Phase 3) ───────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={15} color="var(--hl-teal)" /> Notifications
        </p>

        <NotifToggle
          label="Daily summary"
          description="08:00 push: positions open, net P&L, current regime"
          storageKey="notif_daily"
        />
        <NotifToggle
          label="Regime change"
          description="Alert when market regime shifts (HOT ↔ NEUTRAL ↔ COLD)"
          storageKey="notif_regime"
        />
        <NotifToggle
          label="Position exited"
          description="Alert when engine auto-exits a pair"
          storageKey="notif_exit"
        />
        <NotifToggle
          label="Rate alert"
          description="Alert when a held pair's rate drops below exit threshold"
          storageKey="notif_rate_drop"
        />

        <div style={{ marginTop: 'var(--sp-4)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
            Email / Webhook URL (optional)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="https://hooks.zapier.com/…"
              style={{ flex: 1 }}
              value={emailWebhook}
              onChange={e => setEmailWebhook(e.target.value)}
            />
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }} onClick={saveEmailWebhook}>
              Save
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            POST endpoint receives JSON daily summary. Compatible with Zapier, Make, n8n, or any custom handler.
          </p>
        </div>
      </div>

      {/* ── Data Export (Phase 3) ─────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={15} color="var(--text-secondary)" /> Data Export
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={handleExportTradeCSV} style={{ fontSize: 12, padding: '6px 14px' }}>
            <Download size={13} /> Download Trade Log (CSV)
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
          Exports all {trades.length} closed trade{trades.length !== 1 ? 's' : ''} with symbol, timestamps, funding earned, fees, and net P&L.
        </p>
      </div>

      {/* Security */}
      <div style={{
        background: 'rgba(245,197,66,0.06)', border: '1px solid rgba(245,197,66,0.2)',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={14} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent-yellow)' }}>Security:</strong> Osprey never stores or transmits your private key.
          All signing happens locally in your browser. Never share your seed phrase.
        </p>
      </div>
    </div>
  );
};

export default Settings;
