/**
 * Signer abstraction — supports browser wallets, WalletConnect (auth only), and Agent Keys.
 *
 * Agent Keys are the correct approach for automated trading:
 *   - A secondary EOA authorized by the main account to sign orders
 *   - Cannot withdraw funds (critical security property)
 *   - Requires no browser, no MetaMask, no popup
 *
 * WalletConnect is supported for one-time approveAgent signing ONLY.
 * WalletConnect cannot place trade orders — use agentKey mode for automation.
 */

import type { Signer } from 'ethers';
import {
  buildAgentSigner,
  generateAgentKey,
  buildApproveAgentPayload,
  type SignerMode,
  type OspreySignerConfig,
} from '@osprey/engine';

// SignerMode / OspreySignerConfig / generateAgentKey / buildApproveAgentPayload
// are defined in @osprey/engine (portable, no browser APIs — shared with the
// future server, which also needs to construct agent-key signers) and
// re-exported here so existing app code and test mocks don't need to change.
export type { SignerMode, OspreySignerConfig };
export { generateAgentKey, buildApproveAgentPayload };

/**
 * Build an ethers.Signer from any supported auth method. Browser and
 * WalletConnect modes are handled here (require `window`/an injected
 * provider); agentKey mode delegates to the portable @osprey/engine signer.
 */
export async function buildSigner(config: OspreySignerConfig): Promise<Signer> {
  if (config.mode === 'agentKey' && config.privateKey) {
    return buildAgentSigner(config.privateKey);
  }

  if ((config.mode === 'browser' || config.mode === 'walletconnect_auth_only') && config.provider) {
    const { ethers } = await import('ethers');
    const provider = new ethers.BrowserProvider(
      config.provider as ConstructorParameters<typeof ethers.BrowserProvider>[0]
    );
    return provider.getSigner();
  }

  throw new Error('buildSigner: no valid config. Provide privateKey for agentKey mode or provider for browser/walletconnect_auth_only mode.');
}

/**
 * Detect any EIP-1193 injected wallet.
 */
export function detectInjectedWallet(): unknown | null {
  const win = window as Window & { ethereum?: unknown };
  return win.ethereum ?? null;
}

/**
 * Get the wallet name for display.
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

// S-03: iteration count raised from 100_000 to 600_000 per OWASP 2023 guidance.
// Decrypt transparently re-encrypts old blobs (100k) at 600k on next unlock.
const PBKDF2_ITERATIONS_CURRENT = 600_000;
const PBKDF2_ITERATIONS_LEGACY  = 100_000;   // blobs created before this change

/**
 * Encrypt an agent key private key using the Web Crypto API.
 * S-03: 600k PBKDF2 iterations, SHA-256, AES-GCM-256.
 */
export async function encryptAgentKey(privateKey: string, password: string): Promise<string> {
  const enc     = new TextEncoder();
  const keyMat  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const aesKey  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS_CURRENT, hash: 'SHA-256' },
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
    iterations: PBKDF2_ITERATIONS_CURRENT,   // stored so decryption knows which count to use
  });
}

/**
 * Decrypt an agent key. If the blob uses legacy iteration count (100k),
 * re-encrypts at 600k and stores the upgraded blob (S-03 migration).
 */
export async function decryptAgentKey(
  encrypted: string,
  password: string,
  /** Optional callback to persist the re-encrypted blob (for migration) */
  onUpgrade?: (newBlob: string) => void,
): Promise<string> {
  const enc    = new TextEncoder();
  const dec    = new TextDecoder();
  const parsed = JSON.parse(encrypted) as {
    salt: number[]; iv: number[]; ciphertext: number[]; iterations?: number;
  };

  // S-03 migration: use stored iteration count, fall back to legacy 100k
  const iterations = parsed.iterations ?? PBKDF2_ITERATIONS_LEGACY;

  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(parsed.salt), iterations, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(parsed.iv) },
    aesKey,
    new Uint8Array(parsed.ciphertext)
  );

  const privateKey = dec.decode(plain);

  // Transparent migration: if blob was encrypted with fewer iterations, re-encrypt now
  if (iterations < PBKDF2_ITERATIONS_CURRENT && onUpgrade) {
    encryptAgentKey(privateKey, password).then(onUpgrade).catch(() => {/* non-critical */});
  }

  return privateKey;
}

/**
 * P0-08: Revoke an agent key on Hyperliquid.
 *
 * Sends approveAgent with agentAddress = zero address, which deregisters
 * any currently-authorized unnamed agent wallet for this account.
 *
 * See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets
 * Checked: 2026-06-15.  Revoke = re-approve with zero address.
 *
 * Requires a user-signed (master wallet) action — not an agent-key-signed action.
 * The signer here MUST be the master account (browser wallet / WalletConnect).
 */
export async function revokeAgentOnHL(params: {
  masterSigner: import('ethers').Signer;
  restUrl:      string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { action, nonce } = buildApproveAgentPayload({
      agentAddress: '0x0000000000000000000000000000000000000000',
      agentName:    '',
    });

    // User-signed actions use a DIFFERENT EIP-712 domain than L1 phantom actions.
    // chainId: 0x66eee (421614) for user-signed Hyperliquid actions.
    // See: https://docs.chainstack.com/docs/hyperliquid-user-signed-actions
    // Checked: 2026-06-15.
    const { ethers } = await import('ethers');
    const domain = {
      name:              'HyperliquidSignTransaction',
      version:           '1',
      chainId:           421614,   // 0x66eee — user-signed actions domain
      verifyingContract: '0x0000000000000000000000000000000000000000',
    };
    const types = {
      'HyperliquidTransaction:ApproveAgent': [
        { name: 'hyperliquidChain', type: 'string'  },
        { name: 'agentAddress',     type: 'address' },
        { name: 'agentName',        type: 'string'  },
        { name: 'nonce',            type: 'uint64'  },
      ],
    };
    const value = {
      hyperliquidChain: 'Mainnet',
      agentAddress:     '0x0000000000000000000000000000000000000000',
      agentName:        '',
      nonce,
    };

    const signer = params.masterSigner as import('ethers').Signer & {
      signTypedData: (d: unknown, t: unknown, v: unknown) => Promise<string>;
    };
    const sig    = await signer.signTypedData(domain, types, value);
    const { r, s, v } = ethers.Signature.from(sig);

    const res = await fetch(`${params.restUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, nonce, signature: { r, s, v }, vaultAddress: null }),
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    const data = await res.json();
    if (data.status === 'ok') return { success: true };
    return { success: false, error: data.error ?? JSON.stringify(data) };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
