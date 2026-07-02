/**
 * Phase 1 / N-NEW-01: wallet.ts is now a thin re-export of the canonical
 * WalletState from account.ts. The duplicate shape that used to live here
 * (missing `network`, `agentAddress`) has been removed.
 * Import WalletState from '../types/account' everywhere.
 */
export type { WalletState, ConnectMethod } from './account';
export type { SignerMode } from '../signing';

export interface AgentKeyMeta {
  address:    string;
  name:       string;
  createdAt:  number;
  authorized: boolean;   // true once approveAgent has been signed
}
