/**
 * Portable agent-key signing primitives — no browser APIs.
 *
 * Agent Keys are a secondary EOA authorized by a Hyperliquid account to sign
 * orders on its behalf. They cannot withdraw funds — critical security
 * property that makes them the correct mechanism for unattended/server-side
 * trading (this package's reason for existing).
 *
 * Browser-specific concerns (wallet detection, WalletConnect, password-based
 * encryption-at-rest for a human-present session) live in the web app's
 * `src/api/signing.ts`, not here — a headless server needs its own key
 * custody model (see docs/architecture/api-sdk.md, Phase B, Secrets).
 */

import type { Signer } from 'ethers';

/**
 * Signer modes. `browser` and `walletconnect_auth_only` are only ever
 * constructed in the web app (see its `src/api/signing.ts`); the type lives
 * here so both the app and the engine's own types (`types/wallet.ts`) share
 * one definition.
 */
export type SignerMode = 'browser' | 'agentKey' | 'walletconnect_auth_only';

export interface OspreySignerConfig {
  mode: SignerMode;
  provider?: unknown;    // EIP-1193 provider (browser or WalletConnect) — web app only
  privateKey?: string;   // Agent key hex private key
}

/**
 * Build a Signer from a raw agent-key private key. Portable — used by both
 * the web app (agentKey mode) and, eventually, the server's cycle runner.
 */
export async function buildAgentSigner(privateKey: string): Promise<Signer> {
  const { ethers } = await import('ethers');
  return new ethers.Wallet(privateKey);
}

/**
 * Generate a fresh random EOA for use as an agent key.
 */
export async function generateAgentKey(): Promise<{ address: string; privateKey: string }> {
  const { ethers } = await import('ethers');
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

/**
 * Build the approveAgent action payload (L1 phantom-agent action, signed by
 * the master account to authorize the agent key).
 */
export function buildApproveAgentPayload(params: {
  agentAddress: string;
  agentName?: string;
}): { action: object; nonce: number } {
  const nonce = Date.now();
  return {
    action: {
      type: 'approveAgent',
      agentAddress: params.agentAddress,
      agentName: params.agentName ?? 'Osprey',
      nonce,
    },
    nonce,
  };
}
