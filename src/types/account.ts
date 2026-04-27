export type AccountMode = 'demo' | 'real';

export interface WalletState {
  address: string | null;
  connected: boolean;
  balance: number;
  network: 'mainnet' | 'testnet';
}

export interface DemoAccount {
  balance: number;
  initialBalance: number;
  fundingEarned: number;
  feesPaid: number;
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
