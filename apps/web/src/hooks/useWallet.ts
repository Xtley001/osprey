/**
 * useWallet — unified wallet abstraction.
 *
 * Phase 1.2 / N-NEW-01: every connect/disconnect now calls
 * useAppStore.getState().setWallet() so appStore.wallet is always
 * in sync with the local React state.
 *
 * Phase 1.3 / N-NEW-03: a module-level signer registry (_activeGetSigner)
 * is populated by loadAgentKey and cleared on disconnect.  harvestStore
 * reads this to build a Signer at cycle time without storing the raw key
 * in appStore or passing it through props.
 *
 * Signing paths:
 *   1. Browser injected (MetaMask, Coinbase, Brave, Rainbow — EIP-1193)
 *   2. WalletConnect v2  (mobile / hardware — NOT canTradeAutonomously)
 *   3. Hyperliquid Agent Key (automated, no popups)
 */

import { useState, useCallback } from 'react';
import type { Signer } from 'ethers';
import {
  buildSigner,
  detectInjectedWallet,
  getInjectedWalletName,
  generateAgentKey,
  encryptAgentKey,
  decryptAgentKey,
} from '../api/signing';
import { connectWalletConnect } from '../api/walletConnect';
import { WALLETCONNECT_PROJECT } from '@osprey/engine';
import { useAppStore } from '../store/appStore';
import type { ConnectMethod } from '@osprey/engine';

export type WalletConnectMethod = ConnectMethod;   // re-export for legacy consumers

export interface UnifiedWallet {
  address:               string | null;
  connected:             boolean;
  method:                ConnectMethod;
  walletName:            string;
  canTradeAutonomously:  boolean;
  getSigner:             () => Promise<Signer>;
}

const AGENT_KEY_STORAGE = 'osprey_agent_key_v1';

// ── Module-level signer registry (Phase 1.3 / N-NEW-03) ──────────────────────
// The raw private key stays inside the loadAgentKey closure.
// harvestStore reads _activeGetSigner to obtain a Signer at order time.
// Cleared on disconnect so stale signers can't fire after logout.
let _activeGetSigner: (() => Promise<Signer>) | null = null;

/** Called by harvestStore at cycle time.  Returns null when no signer loaded. */
export function getActiveSigner(): (() => Promise<Signer>) | null {
  return _activeGetSigner;
}

export function useWallet() {
  const [wallet, setLocalWallet] = useState<UnifiedWallet>({
    address:              null,
    connected:            false,
    method:               'none',
    walletName:           'Not connected',
    canTradeAutonomously: false,
    getSigner:            async () => { throw new Error('No wallet connected'); },
  });

  const [agentKeyAddress, setAgentKeyAddress] = useState<string | null>(null);
  const [connecting, setConnecting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Sync local wallet state → appStore (Phase 1.2)
  const syncToStore = useCallback((
    address: string | null,
    connected: boolean,
    method: ConnectMethod,
    walletName: string,
    canTradeAutonomously: boolean,
    agentAddress: string | null,
  ) => {
    useAppStore.getState().setWallet({
      address,
      connected,
      method,
      walletName,
      canTradeAutonomously,
      agentAddress,
      network: 'mainnet',   // network stays appStore-owned; don't override
    });
  }, []);

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

      const getSigner = async () => buildSigner({ mode: 'browser', provider });
      _activeGetSigner = getSigner;

      const next: UnifiedWallet = {
        address,
        connected:            true,
        method:               'injected',
        walletName:           getInjectedWalletName(),
        canTradeAutonomously: false,
        getSigner,
      };
      setLocalWallet(next);
      syncToStore(address, true, 'injected', next.walletName, false, null);
      return address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [syncToStore]);

  // ── Connect via WalletConnect ────────────────────────────────────────────────
  const connectWC = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const session = await connectWalletConnect(WALLETCONNECT_PROJECT);
      const getSigner = async () =>
        buildSigner({ mode: 'walletconnect_auth_only', provider: session.provider });
      // WalletConnect cannot trade autonomously — no signer in registry
      _activeGetSigner = null;

      const next: UnifiedWallet = {
        address:              session.address,
        connected:            true,
        method:               'walletconnect',
        walletName:           'WalletConnect',
        canTradeAutonomously: false,
        getSigner,
      };
      setLocalWallet(next);
      syncToStore(session.address, true, 'walletconnect', 'WalletConnect', false, null);
      return session.address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [syncToStore]);

  // ── Load agent key from encrypted storage ────────────────────────────────────
  const loadAgentKey = useCallback(async (password: string) => {
    setConnecting(true);
    setError(null);
    try {
      const stored = localStorage.getItem(AGENT_KEY_STORAGE);
      if (!stored) throw new Error('No agent key found. Generate one in Settings → Trading Authorization.');

      const privateKey = await decryptAgentKey(
        stored,
        password,
        // S-03 migration: if blob uses old 100k iterations, re-encrypt at 600k transparently
        (newBlob) => localStorage.setItem(AGENT_KEY_STORAGE, newBlob),
      );
      const { ethers }  = await import('ethers');
      const agentWallet = new ethers.Wallet(privateKey);

      // Phase 1.3: capture the key in closure; register in module-level registry.
      // The raw key never leaves this closure or enters appStore.
      const getSigner = async () => buildSigner({ mode: 'agentKey', privateKey });
      _activeGetSigner = getSigner;

      setAgentKeyAddress(agentWallet.address);
      const next: UnifiedWallet = {
        address:              agentWallet.address,
        connected:            true,
        method:               'agentKey',
        walletName:           'Agent Key (Osprey)',
        canTradeAutonomously: true,
        getSigner,
      };
      setLocalWallet(next);
      // Phase 1.2: sync to appStore — canTradeAutonomously now live
      syncToStore(agentWallet.address, true, 'agentKey', 'Agent Key (Osprey)', true, agentWallet.address);
      return agentWallet.address;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [syncToStore]);

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

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    _activeGetSigner = null;
    const disconnected: UnifiedWallet = {
      address:              null,
      connected:            false,
      method:               'none',
      walletName:           'Not connected',
      canTradeAutonomously: false,
      getSigner:            async () => { throw new Error('No wallet connected'); },
    };
    setLocalWallet(disconnected);
    syncToStore(null, false, 'none', 'Not connected', false, null);
    setError(null);
  }, [syncToStore]);

  const revokeAgentKey = useCallback(() => {
    localStorage.removeItem(AGENT_KEY_STORAGE);
    setAgentKeyAddress(null);
    disconnect();
  }, [disconnect]);

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
