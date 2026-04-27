/**
 * useWallet — unified wallet abstraction.
 *
 * Abstracts over three signing paths:
 *   1. Browser injected wallet (MetaMask, Coinbase, Brave, Rainbow — any EIP-1193)
 *   2. WalletConnect v2 (mobile wallets, hardware wallets)
 *   3. Hyperliquid Agent Key (automated trading — no popups, no browser required)
 *
 * The `canTradeAutonomously` flag gates automated harvest cycles.
 * When false, the UI warns that orders require manual approval.
 */

import { useState, useCallback } from 'react';
import type { Signer } from 'ethers';
import { buildSigner, detectInjectedWallet, getInjectedWalletName, generateAgentKey, encryptAgentKey, decryptAgentKey } from '../api/signing';
import { connectWalletConnect } from '../api/walletConnect';
import { WALLETCONNECT_PROJECT } from '../utils/constants';

export type WalletConnectMethod = 'injected' | 'walletconnect' | 'agentKey' | 'none';

export interface UnifiedWallet {
  address:               string | null;
  connected:             boolean;
  method:                WalletConnectMethod;
  walletName:            string;
  canTradeAutonomously:  boolean;   // true only for agentKey
  getSigner:             () => Promise<Signer>;
}

const AGENT_KEY_STORAGE = 'osprey_agent_key_v1';

export function useWallet() {
  const [wallet, setWallet] = useState<UnifiedWallet>({
    address:              null,
    connected:            false,
    method:               'none',
    walletName:           'Not connected',
    canTradeAutonomously: false,
    getSigner:            async () => { throw new Error('No wallet connected'); },
  });

  const [agentKeyAddress, setAgentKeyAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Connect injected browser wallet ─────────────────────────────────────────
  const connectInjected = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const provider = detectInjectedWallet();
      if (!provider) {
        throw new Error('No browser wallet detected. Install MetaMask, Coinbase Wallet, or Brave Wallet.');
      }

      const eth = provider as { request: (args: { method: string; params?: unknown[] }) => Promise<string[]> };
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      if (!address) throw new Error('No account returned from wallet');

      setWallet({
        address,
        connected:            true,
        method:               'injected',
        walletName:           getInjectedWalletName(),
        canTradeAutonomously: false,
        getSigner: async () => buildSigner({ mode: 'browser', provider }),
      });

      return address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Connect via WalletConnect ────────────────────────────────────────────────
  const connectWC = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const session = await connectWalletConnect(WALLETCONNECT_PROJECT);
      setWallet({
        address:              session.address,
        connected:            true,
        method:               'walletconnect',
        walletName:           'WalletConnect',
        canTradeAutonomously: false,
        getSigner: async () => buildSigner({ mode: 'walletconnect', provider: session.provider }),
      });
      return session.address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Load agent key from encrypted storage ────────────────────────────────────
  const loadAgentKey = useCallback(async (password: string) => {
    setConnecting(true);
    setError(null);
    try {
      const stored = localStorage.getItem(AGENT_KEY_STORAGE);
      if (!stored) throw new Error('No agent key found. Generate one in Settings → Trading Authorization.');

      const privateKey = await decryptAgentKey(stored, password);
      const { ethers }  = await import('ethers');
      const agentWallet = new ethers.Wallet(privateKey);

      setAgentKeyAddress(agentWallet.address);
      setWallet({
        address:              agentWallet.address,
        connected:            true,
        method:               'agentKey',
        walletName:           'Agent Key (Osprey)',
        canTradeAutonomously: true,
        getSigner: async () => buildSigner({ mode: 'agentKey', privateKey }),
      });

      return agentWallet.address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Generate a new agent key ──────────────────────────────────────────────────
  const createAgentKey = useCallback(async (password: string) => {
    const { address, privateKey } = await generateAgentKey();
    const encrypted = await encryptAgentKey(privateKey, password);
    localStorage.setItem(AGENT_KEY_STORAGE, encrypted);
    setAgentKeyAddress(address);
    return { address, privateKey };
  }, []);

  // ── Export agent key (for backup) ────────────────────────────────────────────
  const exportAgentKey = useCallback(async (password: string): Promise<string> => {
    const stored = localStorage.getItem(AGENT_KEY_STORAGE);
    if (!stored) throw new Error('No agent key stored');
    return decryptAgentKey(stored, password);
  }, []);

  // ── Revoke agent key ─────────────────────────────────────────────────────────
  const revokeAgentKey = useCallback(() => {
    localStorage.removeItem(AGENT_KEY_STORAGE);
    setAgentKeyAddress(null);
    disconnect();
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setWallet({
      address:              null,
      connected:            false,
      method:               'none',
      walletName:           'Not connected',
      canTradeAutonomously: false,
      getSigner:            async () => { throw new Error('No wallet connected'); },
    });
    setError(null);
  }, []);

  const hasStoredAgentKey = !!localStorage.getItem(AGENT_KEY_STORAGE);

  return {
    wallet,
    agentKeyAddress,
    connecting,
    error,
    hasStoredAgentKey,
    connectInjected,
    connectWC,
    loadAgentKey,
    createAgentKey,
    exportAgentKey,
    revokeAgentKey,
    disconnect,
  };
}
