/**
 * connect.ts — shared browser-wallet connect/disconnect actions.
 *
 * Extracted from Settings so the TopBar (and anywhere else) can trigger the
 * exact same flow instead of deep-linking users into Settings to connect
 * (audit P1-1). Keeps wallet-session persistence + HL balance fetch in one place.
 */
import { fetchAccountState } from '@osprey/engine';
import { useAppStore } from '../store/appStore';
import { toast } from '../components/shared/Toast';
import { formatUSD } from '@osprey/engine';

const WALLET_STORAGE_KEY = 'osprey_wallet_v1';

type Eth = {
  request: (args: { method: string }) => Promise<string[]>;
  on?: (e: string, cb: (a: string[]) => void) => void;
  removeListener?: (e: string, cb: (a: string[]) => void) => void;
};

function getEthereum(): Eth | undefined {
  return (window as Window & { ethereum?: Eth }).ethereum;
}

export function saveWalletSession(address: string) {
  try { localStorage.setItem(WALLET_STORAGE_KEY, address); } catch { /* ignore */ }
}
export function clearWalletSession() {
  try { localStorage.removeItem(WALLET_STORAGE_KEY); } catch { /* ignore */ }
}
export function getSavedWalletAddress(): string | null {
  try { return localStorage.getItem(WALLET_STORAGE_KEY); } catch { return null; }
}

/** Connect an injected browser wallet. Returns the address, or null if cancelled/failed. */
export async function connectBrowserWallet(): Promise<string | null> {
  const eth = getEthereum();
  if (!eth) {
    toast.error('No browser wallet found. Install MetaMask or configure an Agent Key in Settings.');
    return null;
  }
  try {
    const accounts = await eth.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];
    if (!address) throw new Error('No account returned');

    saveWalletSession(address);
    useAppStore.getState().setWallet({ address, connected: true, balance: 0 });
    toast.info('Wallet connected · fetching Hyperliquid balance…');

    fetchAccountState(address).then(state => {
      if (state) {
        useAppStore.getState().setWallet({ balance: state.balance });
        toast.success(state.balance > 0 ? `Balance: ${formatUSD(state.balance)}` : 'Connected · No HL balance found');
      }
    });
    return address;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('rejected') || msg.includes('denied')) {
      toast.warning('Wallet connection cancelled.');
    } else {
      toast.error(`Connection failed: ${msg}`);
    }
    return null;
  }
}

export function disconnectWallet() {
  clearWalletSession();
  useAppStore.getState().setWallet({ address: null, connected: false, balance: 0 });
  toast.info('Wallet disconnected');
}
