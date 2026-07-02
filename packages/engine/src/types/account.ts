export type AccountMode = 'live';

// N-NEW-01 / Phase 1: single canonical WalletState.
// The TWO prior duplicate shapes (src/types/wallet.ts and src/types/portfolio.ts)
// are collapsed here. All store consumers import from this file only.
export type ConnectMethod = 'injected' | 'walletconnect' | 'agentKey' | 'none';

export interface WalletState {
  address:              string | null;
  connected:            boolean;
  balance:              number;
  network:              'mainnet' | 'testnet';
  // F-02 layer 2 — was always undefined in old shape; now explicitly typed.
  canTradeAutonomously: boolean;
  method:               ConnectMethod;
  walletName:           string;
  // Public address of the authorized agent key, if loaded. NOT the private key.
  agentAddress:         string | null;
}

export type RegimeLabel = 'HOT' | 'NEUTRAL' | 'COLD';

export interface RegimeState {
  label: RegimeLabel;
  marketAvgRate: number;
  breadth: number;
  trend: 'rising' | 'falling' | 'stable';
  hoursInRegime: number;
  confidence: number;
}
