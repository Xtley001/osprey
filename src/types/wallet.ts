/**
 * Wallet and signer types.
 */

export type SignerMode = 'browser' | 'agentKey' | 'walletconnect';
export type ConnectMethod = 'injected' | 'walletconnect' | 'agentKey' | 'none';

export interface WalletState {
  address:              string | null;
  connected:            boolean;
  balance:              number;
  method:               ConnectMethod;
  walletName:           string;
  canTradeAutonomously: boolean;
}

export interface AgentKeyMeta {
  address:   string;
  name:      string;
  createdAt: number;
  authorized: boolean;   // true once approveAgent has been signed
}
