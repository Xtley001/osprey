/**
 * Signer abstraction — supports browser wallets, WalletConnect, and Agent Keys.
 *
 * The original code was hard-wired to MetaMask (window.ethereum). This module
 * provides a unified signer that works with any EIP-1193 provider, WalletConnect,
 * or a Hyperliquid Agent Key (the correct approach for automated trading).
 *
 * Agent Keys:
 *   - A secondary EOA authorized by the main account to sign orders
 *   - Cannot withdraw funds (critical security property)
 *   - Requires no browser, no MetaMask, no popup
 *   - This is what every serious HL bot uses for automation
 */

import type { Signer } from 'ethers';

export type SignerMode = 'browser' | 'agentKey' | 'walletconnect';

export interface OspreySignerConfig {
  mode: SignerMode;
  provider?: unknown;    // EIP-1193 provider (browser or WalletConnect)
  privateKey?: string;   // Agent key hex private key (stored encrypted)
}

/**
 * Build an ethers.Signer from any supported auth method.
 * All returned signers implement signTypedData — the HL signing interface.
 */
export async function buildSigner(config: OspreySignerConfig): Promise<Signer> {
  const { ethers } = await import('ethers');

  if (config.mode === 'agentKey' && config.privateKey) {
    // Agent key — no browser, no popup, pure automation
    return new ethers.Wallet(config.privateKey);
  }

  if ((config.mode === 'browser' || config.mode === 'walletconnect') && config.provider) {
    const provider = new ethers.BrowserProvider(
      config.provider as ConstructorParameters<typeof ethers.BrowserProvider>[0]
    );
    return provider.getSigner();
  }

  throw new Error('buildSigner: no valid config. Provide privateKey for agentKey mode or provider for browser/walletconnect mode.');
}

/**
 * Detect any EIP-1193 injected wallet (not just MetaMask).
 * Returns the provider if found, null otherwise.
 */
export function detectInjectedWallet(): unknown | null {
  const win = window as Window & { ethereum?: unknown };
  return win.ethereum ?? null;
}

/**
 * Get the wallet name for display.
 * MetaMask injects window.ethereum.isMetaMask, Coinbase injects isCoinbaseWallet, etc.
 */
export function getInjectedWalletName(): string {
  const eth = (window as Window & {
    ethereum?: {
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
      isBraveWallet?: boolean;
      isRainbow?: boolean;
    }
  }).ethereum;

  if (!eth) return 'No wallet detected';
  if (eth.isCoinbaseWallet) return 'Coinbase Wallet';
  if (eth.isBraveWallet)    return 'Brave Wallet';
  if (eth.isRainbow)        return 'Rainbow';
  if (eth.isMetaMask)       return 'MetaMask';
  return 'Browser Wallet';
}

/**
 * Encrypt an agent key private key using the Web Crypto API.
 * The key is encrypted with a user-supplied password via AES-GCM.
 * Stored as a JSON string in localStorage.
 */
export async function encryptAgentKey(privateKey: string, password: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyMat  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const aesKey  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv         = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(privateKey));

  return JSON.stringify({
    salt:       Array.from(salt),
    iv:         Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  });
}

/**
 * Decrypt an agent key from localStorage.
 */
export async function decryptAgentKey(encrypted: string, password: string): Promise<string> {
  const enc    = new TextEncoder();
  const dec    = new TextDecoder();
  const { salt, iv, ciphertext } = JSON.parse(encrypted) as {
    salt: number[];
    iv: number[];
    ciphertext: number[];
  };

  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    new Uint8Array(ciphertext)
  );

  return dec.decode(plain);
}

/**
 * Generate a fresh random EOA for use as an agent key.
 * Returns { address, privateKey } — user must authorize this address on HL.
 */
export async function generateAgentKey(): Promise<{ address: string; privateKey: string }> {
  const { ethers } = await import('ethers');
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

/**
 * Build the approveAgent action payload.
 * The main wallet must sign this ONCE to authorize the agent key.
 * After this, the agent key can trade without user interaction.
 */
export function buildApproveAgentPayload(params: {
  agentAddress: string;
  agentName?:   string;
}): { action: object; nonce: number } {
  const nonce = Date.now();
  return {
    action: {
      type:         'approveAgent',
      agentAddress: params.agentAddress,
      agentName:    params.agentName ?? 'Osprey',
      nonce,
    },
    nonce,
  };
}
