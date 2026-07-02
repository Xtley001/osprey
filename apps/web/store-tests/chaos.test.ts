/**
 * store-tests/chaos.test.ts — API failure injection + concurrency tests.
 *
 * Phase 1 of the QA plan: simulate network failures, malformed HL API data,
 * unfilled orders, and overlapping cycles. The invariant under test everywhere:
 * the store must never record a position that wasn't confirmed on HL, and a
 * failed cycle must always release the `running` lock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHarvestStore } from '../src/store/harvestStore';
import { useAppStore } from '../src/store/appStore';
import { usePositionStore } from '../src/store/positionStore';
import { useScannerStore } from '../src/store/scannerStore';

vi.mock('@osprey/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@osprey/engine')>()),
  placeMarketOrder:  vi.fn(),
  placeSpotOrder:    vi.fn(),
  fetchAccountState: vi.fn(),
  fetchFundingRates: vi.fn().mockResolvedValue([]),
  fetchOpenOrders:   vi.fn().mockResolvedValue([]),
  cancelOrder:       vi.fn().mockResolvedValue({ success: true }),
  getCoinIndex:      vi.fn().mockResolvedValue(0),
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

const DEFAULT_CONFIG = {
  enabled: false, hedgeMode: 'hl_spot' as const, maxHoldHours: 72,
  minFundingRateAPR: 0.10, maxPositions: 5, capitalPerPosition: 1000,
  maxDrawdownPct: 0.05, rebalanceThreshold: 0.02,
};

function resetStores() {
  useHarvestStore.setState({
    config: { ...DEFAULT_CONFIG, enabled: true }, armed: true, running: false,
    lastRunAt: 0, nextRunAt: 0, log: [], totalAutoEarned: 0, totalAutoFees: 0,
  });
  useAppStore.setState({
    wallet: {
      address: '0xDEAD', connected: true, balance: 10000, network: 'mainnet',
      canTradeAutonomously: true, method: 'agentKey',
      walletName: 'Agent Key', agentAddress: '0xAGENT',
    },
    regime: 'NEUTRAL', prevRegimeAvg: 0, accountMarginBuffer: 100,
  });
  usePositionStore.setState({ positions: [], trades: [] });
  useScannerStore.setState({
    pairs: [{
      symbol: 'ETH', currentRate: 0.5, price: 2000, openInterest: 2_000_000,
      nextFundingTime: Date.now() + 3600000, volume24h: 1_000_000,
      predictedRate: 0.5, entryThreshold: 0.10, exitThreshold: 0.05,
    }] as any,
  });
}

async function mockSignerReady() {
  const walletMod = await import('../src/hooks/useWallet');
  const mockSigner = { signTypedData: vi.fn().mockResolvedValue('0xsig') } as any;
  return vi.spyOn(walletMod, 'getActiveSigner').mockReturnValue(async () => mockSigner);
}

async function mockCycleActions(actions: unknown[]) {
  const engine = await import('@osprey/engine');
  return vi.spyOn(engine, 'runHarvestCycle').mockReturnValue({
    actions: actions as any, logLines: [],
  });
}

describe('chaos — network failures during ENTER', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('perp order rejects (network timeout) → cycle error logged, lock released, no position', async () => {
    const { placeMarketOrder, fetchAccountState } = await import('@osprey/engine');
    await mockSignerReady();
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    vi.mocked(placeMarketOrder).mockRejectedValue(new Error('ETIMEDOUT'));
    const spy = await mockCycleActions([{ type: 'ENTER', symbol: 'ETH' }]);

    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(useHarvestStore.getState().running).toBe(false);
    expect(useHarvestStore.getState().log.some(l => l.type === 'ERROR' && l.message.includes('ETIMEDOUT'))).toBe(true);
    spy.mockRestore();
  });

  it('maker order reports success without orderId → treated as unfilled, no position', async () => {
    const { placeMarketOrder, fetchAccountState } = await import('@osprey/engine');
    await mockSignerReady();
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    // Malformed response: success + filledAsMaker but no orderId to confirm
    vi.mocked(placeMarketOrder).mockResolvedValue({ success: true, orderId: undefined, filledAsMaker: true } as any);
    const spy = await mockCycleActions([{ type: 'ENTER', symbol: 'ETH' }]);

    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(useHarvestStore.getState().log.some(l => l.type === 'ENTER_FAILED')).toBe(true);
    spy.mockRestore();
  });

  it('wallet disconnects before ENTER executes → engine auto-disables', async () => {
    const spy = await mockCycleActions([{ type: 'ENTER', symbol: 'ETH' }]);
    useAppStore.setState({
      wallet: { ...useAppStore.getState().wallet, connected: false, address: '' },
    });

    await useHarvestStore.getState().runCycle();

    expect(useHarvestStore.getState().config.enabled).toBe(false);
    expect(usePositionStore.getState().positions).toHaveLength(0);
    spy.mockRestore();
  });

  it('pair price is 0 (malformed feed) → entry skipped, no order placed', async () => {
    const { placeMarketOrder, fetchAccountState } = await import('@osprey/engine');
    await mockSignerReady();
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    useScannerStore.setState({
      pairs: [{ symbol: 'ETH', currentRate: 0.5, price: 0, openInterest: 2_000_000 }] as any,
    });
    const spy = await mockCycleActions([{ type: 'ENTER', symbol: 'ETH' }]);

    await useHarvestStore.getState().runCycle();

    expect(placeMarketOrder).not.toHaveBeenCalled();
    expect(usePositionStore.getState().positions).toHaveLength(0);
    spy.mockRestore();
  });
});

describe('chaos — network failures during EXIT', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  function addOpenPosition() {
    usePositionStore.setState({
      positions: [{
        id: 'pos-1', symbol: 'ETH',
        entryTime: Date.now() - 3_600_000, entryPrice: 2000, entryRate: 0.5,
        notional: 500, fundingEarned: 2, feesPaid: 0.85,
        currentPrice: 2000, currentRate: 0.5, hedgeDrift: 0, hoursHeld: 1,
      }] as any,
      trades: [],
    });
  }

  it('fetchAccountState returns null during EXIT → position retained for retry', async () => {
    const { fetchAccountState, placeMarketOrder } = await import('@osprey/engine');
    await mockSignerReady();
    addOpenPosition();
    vi.mocked(fetchAccountState).mockResolvedValue(null as any);
    const spy = await mockCycleActions([{ type: 'EXIT', positionId: 'pos-1', symbol: 'ETH', reason: 'test' }]);

    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions).toHaveLength(1);
    expect(placeMarketOrder).not.toHaveBeenCalled();
    expect(useHarvestStore.getState().log.some(l => l.type === 'EXIT_FAILED')).toBe(true);
    spy.mockRestore();
  });

  it('close order rejected by HL → position retained, EXIT_FAILED logged', async () => {
    const { fetchAccountState, placeMarketOrder } = await import('@osprey/engine');
    await mockSignerReady();
    addOpenPosition();
    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{ position: { coin: 'ETH', szi: '-0.25', entryPx: '2000', cumFunding: { sinceOpen: '2', allTime: '2' } } }],
    } as any);
    vi.mocked(placeMarketOrder).mockResolvedValue({ success: false, error: 'Insufficient margin' } as any);
    const spy = await mockCycleActions([{ type: 'EXIT', positionId: 'pos-1', symbol: 'ETH', reason: 'test' }]);

    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions).toHaveLength(1);
    expect(useHarvestStore.getState().log.some(l => l.type === 'EXIT_FAILED')).toBe(true);
    spy.mockRestore();
  });

  it('phantom position (no HL exposure) → cleaned up locally without placing orders', async () => {
    const { fetchAccountState, placeMarketOrder } = await import('@osprey/engine');
    await mockSignerReady();
    addOpenPosition();
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    const spy = await mockCycleActions([{ type: 'EXIT', positionId: 'pos-1', symbol: 'ETH', reason: 'test' }]);

    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions).toHaveLength(0);
    expect(placeMarketOrder).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('chaos — malformed HL API data', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('NaN cumFunding from HL does not corrupt local fundingEarned', async () => {
    const { fetchAccountState } = await import('@osprey/engine');
    await mockSignerReady();
    usePositionStore.setState({
      positions: [{
        id: 'pos-1', symbol: 'ETH',
        entryTime: Date.now() - 3_600_000, entryPrice: 2000, entryRate: 0.5,
        notional: 500, fundingEarned: 7.5, feesPaid: 0.85,
        currentPrice: 2000, currentRate: 0.5, hedgeDrift: 0, hoursHeld: 1,
      }] as any,
      trades: [],
    });
    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{ position: { coin: 'ETH', szi: '-0.25', entryPx: '2000', cumFunding: { sinceOpen: 'not-a-number', allTime: '0' } } }],
    } as any);
    const spy = await mockCycleActions([]);

    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions[0].fundingEarned).toBe(7.5);
    spy.mockRestore();
  });

  it('fetchAccountState throwing does not kill the cycle (non-critical path)', async () => {
    const { fetchAccountState } = await import('@osprey/engine');
    await mockSignerReady();
    vi.mocked(fetchAccountState).mockRejectedValue(new Error('HTTP 503'));
    const spy = await mockCycleActions([]);

    await useHarvestStore.getState().runCycle();

    // Cycle completed: lock released, no ERROR from the account-state fetch
    expect(useHarvestStore.getState().running).toBe(false);
    expect(useHarvestStore.getState().log.some(l => l.message.includes('Cycle error'))).toBe(false);
    spy.mockRestore();
  });
});

describe('chaos — concurrency', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('overlapping runCycle calls execute the engine only once', async () => {
    const { fetchAccountState } = await import('@osprey/engine');
    await mockSignerReady();
    // Deferred promise keeps the first cycle in flight while the second starts
    let release!: (v: unknown) => void;
    vi.mocked(fetchAccountState).mockImplementation(
      () => new Promise(r => { release = r; }) as any
    );
    const spy = await mockCycleActions([]);

    const first  = useHarvestStore.getState().runCycle();
    const second = useHarvestStore.getState().runCycle();  // should no-op on `running` guard
    release({ balance: 10000, marginBuffer: 100, positions: [] });
    await Promise.all([first, second]);

    const engine = await import('@osprey/engine');
    expect(engine.runHarvestCycle).toHaveBeenCalledTimes(1);
    expect(useHarvestStore.getState().running).toBe(false);
    spy.mockRestore();
  });

  it('disabling the engine mid-flight prevents the next cycle', async () => {
    const spy = await mockCycleActions([]);
    await useHarvestStore.getState().runCycle();
    useHarvestStore.setState({ config: { ...useHarvestStore.getState().config, enabled: false } });
    await useHarvestStore.getState().runCycle();

    const engine = await import('@osprey/engine');
    expect(engine.runHarvestCycle).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
