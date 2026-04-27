/**
 * WalletConnect v2 integration.
 *
 * Enables mobile wallets and hardware wallets (Ledger, Trezor via WalletConnect)
 * to connect to Osprey without MetaMask.
 *
 * Requires: VITE_WALLETCONNECT_PROJECT_ID in .env
 * Get a free project ID at: https://cloud.walletconnect.com
 */

export interface WalletConnectSession {
  address:  string;
  provider: unknown;   // EthereumProvider — typed as unknown to avoid heavy import at module level
  chainId:  number;
}

/**
 * Initialize and connect a WalletConnect session.
 * Shows a QR code modal for the user to scan with their mobile wallet.
 *
 * Usage:
 *   const session = await connectWalletConnect(projectId);
 *   const signer  = await buildSigner({ mode: 'walletconnect', provider: session.provider });
 */
export async function connectWalletConnect(projectId: string): Promise<WalletConnectSession> {
  if (!projectId) {
    throw new Error(
      'WalletConnect project ID not configured. Add VITE_WALLETCONNECT_PROJECT_ID to your .env file. ' +
      'Get a free ID at https://cloud.walletconnect.com'
    );
  }

  // Dynamic import — only loaded when WalletConnect is actually used.
  // Install @walletconnect/ethereum-provider to enable this path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider' as any);

  const provider = await EthereumProvider.init({
    projectId,
    chains:       [42161],    // Arbitrum One (HL bridge chain)
    optionalChains: [1],      // Ethereum mainnet (for signing)
    showQrModal:  true,
    metadata: {
      name:        'Osprey',
      description: 'Delta-neutral funding rate harvesting on Hyperliquid',
      url:         typeof window !== 'undefined' ? window.location.origin : 'https://osprey.app',
      icons:       ['/osprey-icon.svg'],
    },
  });

  await provider.connect();

  const accounts = provider.accounts;
  if (!accounts || accounts.length === 0) {
    throw new Error('WalletConnect: no accounts returned after connection');
  }

  return {
    address:  accounts[0],
    provider,
    chainId:  provider.chainId,
  };
}

/**
 * Disconnect a WalletConnect session.
 */
export async function disconnectWalletConnect(provider: unknown): Promise<void> {
  try {
    const p = provider as { disconnect?: () => Promise<void> };
    if (p?.disconnect) await p.disconnect();
  } catch {
    // Ignore disconnect errors
  }
}
