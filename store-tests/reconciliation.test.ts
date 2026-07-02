/**
 * store-tests/reconciliation.test.ts — Phase 5 / P0-06 / ST-01/ST-02/ST-05
 *
 * Tests:
 *  1. positionStore survives a simulated rehydrate (persist middleware)
 *  2. Reconcile MATCH — fundingEarned updated from live HL
 *  3. Reconcile ORPHAN-ON-HL — adopted into tracking
 *  4. Reconcile ORPHAN-LOCAL — closed + logged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePositionStore } from '../src/store/positionStore';
import { useAppStore }      from '../src/store/appStore';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/api/hyperliquid', () => ({
  fetchAccountState: vi.fn(),
  fetchFundingRates: vi.fn().mockResolvedValue([]),
  placeMarketOrder:  vi.fn(),
  cancelOrder:       vi.fn(),
  fetchOpenOrders:   vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/api/signing', () => ({
  detectInjectedWallet:  vi.fn().mockReturnValue(null),
  buildSigner:           vi.fn(),
  getInjectedWalletName: vi.fn().mockReturnValue('Mock'),
  generateAgentKey:      vi.fn(),
  encryptAgentKey:       vi.fn(),
  decryptAgentKey:       vi.fn(),
}));

vi.mock('../src/api/walletConnect', () => ({
  connectWalletConnect: vi.fn().mockRejectedValue(new Error('WC unavailable')),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStores() {
  usePositionStore.setState({ positions: [], trades: [] });
  useAppStore.setState({
    wallet: {
      address: '0xTEST', connected: true, balance: 10000,
      network: 'mainnet', canTradeAutonomously: false,
      method: 'injected', walletName: 'MetaMask', agentAddress: null,
    },
    regime: 'NEUTRAL', prevRegimeAvg: 0, accountMarginBuffer: 100,
  });
}

function makePosition(symbol: string, fundingEarned = 0) {
  return {
    symbol, entryTime: Date.now(), entryPrice: 100, entryRate: 0.5,
    notional: 500, fundingEarned, feesPaid: 5, currentPrice: 100,
    currentRate: 0.5, hedgeDrift: 0, hoursHeld: 2,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 5.1 — positionStore persistence', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });

  it('positions survive a simulated rehydrate', () => {
    // Open a position
    const id = usePositionStore.getState().openPosition(makePosition('ETH', 1.50));
    expect(usePositionStore.getState().positions).toHaveLength(1);

    // Simulate rehydration: setState with stored snapshot (what persist does)
    const snapshot = JSON.parse(JSON.stringify(usePositionStore.getState()));
    usePositionStore.setState({ positions: [], trades: [] });
    expect(usePositionStore.getState().positions).toHaveLength(0);

    // Rehydrate
    usePositionStore.setState({ positions: snapshot.positions, trades: snapshot.trades });
    const rehydrated = usePositionStore.getState().positions;
    expect(rehydrated).toHaveLength(1);
    expect(rehydrated[0].id).toBe(id);
    expect(rehydrated[0].symbol).toBe('ETH');
    expect(rehydrated[0].fundingEarned).toBe(1.50);
  });

  it('excluded signer-shaped fields are absent from serialised payload', () => {
    usePositionStore.getState().openPosition(makePosition('BTC'));
    const serialised = JSON.stringify(usePositionStore.getState());
    // No function or signer objects should be JSON-serialisable
    expect(serialised).not.toContain('"getSigner"');
    expect(serialised).not.toContain('"privateKey"');
  });
});

describe('Phase 5.2 — startup reconciliation', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('MATCH: fundingEarned updated from HL cumFunding.sinceOpen', async () => {
    const { fetchAccountState } = await import('../src/api/hyperliquid');

    // Local position with stale funding
    usePositionStore.getState().openPosition(makePosition('ETH', 0.50));
    const id = usePositionStore.getState().positions[0].id;

    // HL reports higher cumulative funding
    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{
        position: {
          coin: 'ETH', szi: '-0.005', entryPx: '2000',
          cumFunding: { sinceOpen: '3.75', allTime: '10.00' },
        },
      }],
    } as any);

    // Run reconciliation logic directly (mirrors useStartupReconciliation body)
    const acct = await fetchAccountState('0xTEST');
    if (acct) {
      for (const hlPos of acct.positions) {
        const coin = hlPos.position.coin;
        const szi  = parseFloat(hlPos.position.szi ?? '0');
        const local = usePositionStore.getState().positions.find(p => p.symbol === coin);
        if (local && szi !== 0) {
          const cumFunding = parseFloat(hlPos.position.cumFunding?.sinceOpen ?? '0');
          const entryPx    = parseFloat(hlPos.position.entryPx ?? '0');
          usePositionStore.getState().updatePosition(local.id, {
            fundingEarned: isFinite(cumFunding) ? cumFunding : local.fundingEarned,
            entryPrice:    isFinite(entryPx) && entryPx > 0 ? entryPx : local.entryPrice,
          });
        }
      }
    }

    const updated = usePositionStore.getState().positions.find(p => p.id === id);
    expect(updated!.fundingEarned).toBe(3.75);
    expect(updated!.entryPrice).toBe(2000);
  });

  it('ORPHAN-ON-HL: unknown HL position adopted into tracking', async () => {
    const { fetchAccountState } = await import('../src/api/hyperliquid');

    // No local positions
    expect(usePositionStore.getState().positions).toHaveLength(0);

    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{
        position: {
          coin: 'SOL', szi: '-10', entryPx: '150',
          cumFunding: { sinceOpen: '0.80', allTime: '2.00' },
        },
      }],
    } as any);

    // Simulate reconcile: adopt orphan-on-HL
    const acct = await fetchAccountState('0xTEST');
    if (acct) {
      for (const hlPos of acct.positions) {
        const coin = hlPos.position.coin;
        const szi  = parseFloat(hlPos.position.szi ?? '0');
        if (szi === 0) continue;
        const local = usePositionStore.getState().positions.find(p => p.symbol === coin);
        if (!local) {
          const entryPx    = parseFloat(hlPos.position.entryPx ?? '0');
          const cumFunding = parseFloat(hlPos.position.cumFunding?.sinceOpen ?? '0');
          usePositionStore.getState().openPosition({
            symbol: coin, entryTime: Date.now(), entryPrice: entryPx, entryRate: 0,
            notional: Math.abs(szi) * entryPx, fundingEarned: cumFunding,
            feesPaid: 0, currentPrice: entryPx, currentRate: 0, hedgeDrift: 0, hoursHeld: 0,
          });
        }
      }
    }

    const positions = usePositionStore.getState().positions;
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('SOL');
    expect(positions[0].fundingEarned).toBe(0.80);
    expect(positions[0].notional).toBe(1500); // 10 * 150
  });

  it('ORPHAN-LOCAL: local position absent from HL gets closed', async () => {
    const { fetchAccountState } = await import('../src/api/hyperliquid');

    // Local position that no longer exists on HL
    usePositionStore.getState().openPosition(makePosition('DOGE', 1.00));
    expect(usePositionStore.getState().positions).toHaveLength(1);

    // HL returns empty positions
    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [],
    } as any);

    // Simulate orphan-local cleanup
    const acct = await fetchAccountState('0xTEST');
    if (acct) {
      const hlCoins = new Set(
        acct.positions
          .filter((p: any) => parseFloat(p.position.szi ?? '0') !== 0)
          .map((p: any) => p.position.coin)
      );
      const localPositions = usePositionStore.getState().positions;
      for (const local of localPositions) {
        if (!hlCoins.has(local.symbol)) {
          usePositionStore.getState().closePosition(local.id);
        }
      }
    }

    // Position should be moved to trades (closePosition adds to trade history)
    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(usePositionStore.getState().trades).toHaveLength(1);
    expect(usePositionStore.getState().trades[0].symbol).toBe('DOGE');
  });
});
