import React, { useState } from 'react';
import { Wallet, Shield, RefreshCw, AlertTriangle, Loader } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { DEMO_INITIAL_BALANCE } from '../utils/constants';
import { formatUSD } from '../utils/format';
import { toast } from '../components/shared/Toast';
import { fetchAccountState } from '../api/hyperliquid';

const Settings: React.FC = () => {
  const mode      = useAppStore(s => s.mode);
  const setMode   = useAppStore(s => s.setMode);
  const wallet    = useAppStore(s => s.wallet);
  const setWallet = useAppStore(s => s.setWallet);
  const resetDemo = useAppStore(s => s.resetDemo);
  const demo      = useAppStore(s => s.demo);

  const [connecting, setConnecting] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  const connectWallet = async () => {
    const eth = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) {
      toast.error('MetaMask not found. Install MetaMask to use Live mode.');
      return;
    }
    setConnecting(true);
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      if (!address) throw new Error('No account returned');

      // Fetch real Hyperliquid balance
      toast.info('Fetching account balance from Hyperliquid…');
      const state = await fetchAccountState(address);
      const balance = state?.balance ?? 0;

      setWallet({ address, connected: true, balance });
      setMode('real');
      toast.success(
        balance > 0
          ? `Connected · Balance: ${formatUSD(balance)}`
          : `Connected · No Hyperliquid balance found for this address`
      );
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
        toast.error('Could not fetch balance — check network connection');
      }
    } finally {
      setRefreshingBalance(false);
    }
  };

  const disconnect = () => {
    setWallet({ address: null, connected: false, balance: 0 });
    setMode('demo');
    toast.info('Wallet disconnected · switched to Demo mode');
  };

  const handleReset = () => {
    resetDemo();
    toast.info('Demo account reset to $10,000');
  };

  return (
    <div className="fade-in" style={{ paddingTop: 'var(--sp-4)', maxWidth: 600 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 'var(--sp-5)' }}>Settings</h1>

      {/* Account Mode */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="var(--hl-teal)" /> Account Mode
        </p>
        <div className="grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
          <button onClick={() => setMode('demo')} style={{
            padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${mode === 'demo' ? 'var(--accent-blue)' : 'var(--glass-border)'}`,
            background: mode === 'demo' ? 'rgba(91,141,238,0.1)' : 'var(--bg-elevated)',
            color: mode === 'demo' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
            transition: 'all var(--t-fast)',
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>◉</div>
            Demo Mode
            <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              Paper trading · no real capital at risk · uses live rate data
            </div>
          </button>
          <button onClick={connectWallet} style={{
            padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${mode === 'real' ? 'var(--accent-yellow)' : 'var(--glass-border)'}`,
            background: mode === 'real' ? 'rgba(245,197,66,0.1)' : 'var(--bg-elevated)',
            color: mode === 'real' ? 'var(--accent-yellow)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
            transition: 'all var(--t-fast)',
            opacity: connecting ? 0.6 : 1,
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>◈</div>
            Live Mode
            <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              Real orders · live Hyperliquid capital · requires MetaMask
            </div>
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {mode === 'demo'
            ? 'Demo mode simulates all trades locally using live HL rate data. Nothing is sent to Hyperliquid.'
            : 'Live mode submits real orders to Hyperliquid via your connected wallet. Every trade uses actual capital.'}
        </p>
      </div>

      {/* Wallet */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={15} color="var(--hl-teal)" /> Wallet Connection
        </p>
        {wallet.connected ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-4)' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-yellow)', marginBottom: 4 }}>{wallet.address}</p>
                <p style={{ fontSize: 11, color: 'var(--accent-green)' }}>● Connected to Hyperliquid · {wallet.network}</p>
              </div>
              <button className="btn btn-danger" style={{ padding: '5px 12px', fontSize: 11 }} onClick={disconnect}>
                Disconnect
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)' }}>
              <div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Hyperliquid Balance (USDC)</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: wallet.balance > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                  {wallet.balance > 0 ? formatUSD(wallet.balance) : 'No balance found'}
                </p>
                {wallet.balance === 0 && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    Deposit USDC to Hyperliquid at app.hyperliquid.xyz to trade
                  </p>
                )}
              </div>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={refreshBalance}
                disabled={refreshingBalance}
              >
                {refreshingBalance ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />}
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
              Connect your MetaMask wallet to use Live mode. Osprey fetches your real Hyperliquid balance
              and signs all orders locally — your private key never leaves your machine.
            </p>
            <div style={{ background: 'rgba(91,141,238,0.06)', border: '1px solid rgba(91,141,238,0.15)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', marginBottom: 'var(--sp-4)', fontSize: 11, color: 'var(--accent-blue)' }}>
              You need an active Hyperliquid account with USDC balance to place real trades.
              New to HL? Visit <strong>app.hyperliquid.xyz</strong> to deposit.
            </div>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--accent-yellow)', color: '#0a0b0f', opacity: connecting ? 0.7 : 1 }}
              onClick={connectWallet}
              disabled={connecting}
            >
              {connecting ? <Loader size={14} className="spin" /> : <Wallet size={14} />}
              {connecting ? 'Connecting…' : 'Connect MetaMask'}
            </button>
          </div>
        )}
      </div>

      {/* Demo Account */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={15} color="var(--hl-teal)" /> Demo Account
        </p>
        <div className="grid-3" style={{ marginBottom: 'var(--sp-4)' }}>
          {[
            { label: 'Balance',         value: formatUSD(demo.balance),        color: 'var(--text-primary)' },
            { label: 'Funding Earned',  value: '+' + formatUSD(demo.fundingEarned), color: 'var(--accent-green)' },
            { label: 'Starting',        value: formatUSD(DEMO_INITIAL_BALANCE), color: 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleReset}>
          <RefreshCw size={13} /> Reset to $10,000
        </button>
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
          All signing happens in MetaMask. Your seed phrase should never be shared with any app, website, or person.
        </p>
      </div>
    </div>
  );
};

export default Settings;
