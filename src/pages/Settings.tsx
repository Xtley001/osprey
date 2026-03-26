import React from 'react';
import { Wallet, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { DEMO_INITIAL_BALANCE } from '../utils/constants';
import { formatUSD } from '../utils/format';
import { toast } from '../components/shared/Toast';

const Settings: React.FC = () => {
  const mode      = useAppStore(s => s.mode);
  const setMode   = useAppStore(s => s.setMode);
  const wallet    = useAppStore(s => s.wallet);
  const setWallet = useAppStore(s => s.setWallet);
  const resetDemo = useAppStore(s => s.resetDemo);
  const demo      = useAppStore(s => s.demo);

  const connectWallet = async () => {
    const eth = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) {
      toast.error('MetaMask not found. Please install MetaMask to use Live mode.');
      return;
    }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      if (accounts[0]) {
        setWallet({ address: accounts[0], connected: true });
        setMode('real');
        toast.success('Wallet connected · Live mode active');
      }
    } catch {
      toast.error('Wallet connection cancelled.');
    }
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          {/* Demo — blue */}
          <button onClick={() => setMode('demo')} style={{
            padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', cursor: 'pointer',
            border: `1px solid ${mode === 'demo' ? 'var(--accent-blue)' : 'var(--glass-border)'}`,
            background: mode === 'demo' ? 'rgba(91,141,238,0.1)' : 'var(--bg-elevated)',
            color: mode === 'demo' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, textAlign: 'left',
            transition: 'all var(--t-fast)',
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>●</div>
            Demo Mode
            <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 4 }}>
              Paper trading · no real capital at risk
            </div>
          </button>
          {/* Live — gold */}
          <button onClick={connectWallet} style={{
            padding: 'var(--sp-4)', borderRadius: 'var(--r-md)', cursor: 'pointer',
            border: `1px solid ${mode === 'real' ? 'var(--accent-yellow)' : 'var(--glass-border)'}`,
            background: mode === 'real' ? 'rgba(245,197,66,0.1)' : 'var(--bg-elevated)',
            color: mode === 'real' ? 'var(--accent-yellow)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, textAlign: 'left',
            transition: 'all var(--t-fast)',
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>◈</div>
            Live Mode
            <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 4 }}>
              Real orders · live Hyperliquid capital
            </div>
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {mode === 'demo'
            ? 'Demo mode uses real live rate data but all positions are simulated. Safe to explore strategies without any capital risk.'
            : 'Live mode connects your Hyperliquid wallet and submits real orders. Every trade uses actual capital.'}
        </p>
      </div>

      {/* Wallet */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={15} color="var(--hl-teal)" /> Wallet
        </p>
        {wallet.connected ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-yellow)' }}>{wallet.address}</p>
              <p style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 4 }}>Connected · {wallet.network}</p>
            </div>
            <button className="btn btn-danger" style={{ padding: '5px 14px', fontSize: 12 }}
              onClick={() => { setWallet({ address: null, connected: false }); setMode('demo'); toast.info('Wallet disconnected'); }}>
              Disconnect
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-3)', lineHeight: 1.6 }}>
              Connect your MetaMask wallet to use Live mode. Osprey never has custody — all signing happens locally in your wallet.
            </p>
            <button className="btn btn-primary" onClick={connectWallet} style={{ background: 'var(--accent-yellow)', color: '#0a0b0f' }}>
              <Wallet size={14} /> Connect MetaMask
            </button>
          </>
        )}
      </div>

      {/* Demo Account */}
      <div className="glass-card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 'var(--sp-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={15} color="var(--hl-teal)" /> Demo Account
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
          <div className="stat-card">
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Balance</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>{formatUSD(demo.balance)}</p>
          </div>
          <div className="stat-card">
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Funding Earned</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, color: 'var(--accent-green)' }}>+{formatUSD(demo.fundingEarned)}</p>
          </div>
          <div className="stat-card">
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Starting Balance</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>{formatUSD(DEMO_INITIAL_BALANCE)}</p>
          </div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleReset}>
          <RefreshCw size={13} /> Reset Demo to $10,000
        </button>
      </div>

      {/* Security note */}
      <div style={{
        background: 'rgba(245,197,66,0.06)', border: '1px solid rgba(245,197,66,0.2)',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-4)',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <AlertTriangle size={14} color="var(--accent-yellow)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent-yellow)' }}>Security:</strong> Osprey never stores or transmits your private keys.
          All order signing happens in MetaMask on your local machine. Never share your seed phrase with any application.
        </p>
      </div>
    </div>
  );
};

export default Settings;
