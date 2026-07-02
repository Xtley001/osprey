/**
 * store-tests/harvestStore.test.ts — Phase 0.6 + Phases 1-4 tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHarvestStore } from '../src/store/harvestStore';
import { useAppStore } from '../src/store/appStore';
import { usePositionStore } from '../src/store/positionStore';
import { useScannerStore } from '../src/store/scannerStore';

vi.mock('../src/api/hyperliquid', () => ({
  placeMarketOrder:  vi.fn(),
  fetchAccountState: vi.fn(),
  fetchFundingRates: vi.fn().mockResolvedValue([]),
  fetchOpenOrders:   vi.fn().mockResolvedValue([]),
  cancelOrder:       vi.fn().mockResolvedValue({ success: true }),
  getCoinIndex:      vi.fn().mockResolvedValue(0),
}));
vi.mock('../src/api/signing', () => ({
  detectInjectedWallet:  vi.fn().mockReturnValue(null),
  buildSigner:           vi.fn(),
  getInjectedWalletName: vi.fn().mockReturnValue('Mock Wallet'),
  generateAgentKey:      vi.fn(),
  encryptAgentKey:       vi.fn(),
  decryptAgentKey:       vi.fn(),
}));
vi.mock('../src/api/walletConnect', () => ({
  connectWalletConnect: vi.fn().mockRejectedValue(new Error('WC unavailable in tests')),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const DEFAULT_CONFIG = {
  enabled: false, hedgeMode: 'none' as const, maxHoldHours: 72,
  minFundingRateAPR: 0.10, maxPositions: 5, capitalPerPosition: 1000,
  maxDrawdownPct: 0.05, rebalanceThreshold: 0.02,
};

function resetAllStores() {
  useHarvestStore.setState({
    config: { ...DEFAULT_CONFIG }, armed: false, running: false,
    lastRunAt: 0, nextRunAt: 0, log: [], totalAutoEarned: 0, totalAutoFees: 0,
  });
  useAppStore.setState({
    wallet: {
      address: '', connected: false, balance: 0, network: 'mainnet',
      canTradeAutonomously: false, method: 'none', walletName: '', agentAddress: null,
    },
    regime: 'NEUTRAL', prevRegimeAvg: 0, accountMarginBuffer: 0,
  });
  usePositionStore.setState({ positions: [], trades: [] });
  useScannerStore.setState({ pairs: [] });
}

function enableEngine() {
  useHarvestStore.setState({ config: { ...DEFAULT_CONFIG, enabled: true }, armed: true });
}

function connectWallet(canTrade = false) {
  useAppStore.setState({
    wallet: {
      address: '0xDEAD', connected: true, balance: 10000, network: 'mainnet',
      canTradeAutonomously: canTrade, method: canTrade ? 'agentKey' : 'injected',
      walletName: canTrade ? 'Agent Key' : 'MetaMask', agentAddress: canTrade ? '0xAGENT' : null,
    },
  });
}

function addPair(symbol: string, rate = 0.5, price = 100) {
  useScannerStore.setState({
    pairs: [{
      symbol, currentRate: rate, price, openInterest: 1_000_000,
      nextFundingTime: Date.now() + 3600000, volume24h: 500_000,
      predictedRate: rate, entryThreshold: 0.10, exitThreshold: 0.05,
    }],
  });
}

// ── Smoke ─────────────────────────────────────────────────────────────────────
describe('harvestStore smoke tests', () => {
  beforeEach(() => { resetAllStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('runCycle disabled = no-op', async () => {
    const { placeMarketOrder } = await import('../src/api/hyperliquid');
    await useHarvestStore.getState().runCycle();
    expect(placeMarketOrder).not.toHaveBeenCalled();
    expect(useHarvestStore.getState().log).toHaveLength(0);
  });

  it('toggle() without arm() does not enable', () => {
    useHarvestStore.getState().toggle();
    expect(useHarvestStore.getState().config.enabled).toBe(false);
  });

  it('arm() + toggle() enables', () => {
    useHarvestStore.getState().arm();
    useHarvestStore.getState().toggle();
    expect(useHarvestStore.getState().config.enabled).toBe(true);
  });

  it('disable resets armed', () => {
    useHarvestStore.getState().arm();
    useHarvestStore.getState().toggle();
    useHarvestStore.getState().toggle();
    expect(useHarvestStore.getState().config.enabled).toBe(false);
    expect(useHarvestStore.getState().armed).toBe(false);
  });

  it('HL_REST_URL/HL_WS_URL are non-empty strings', async () => {
    const { HL_REST_URL, HL_WS_URL } = await import('../src/utils/constants');
    expect(typeof HL_REST_URL).toBe('string');
    expect(HL_REST_URL.length).toBeGreaterThan(0);
    expect(HL_WS_URL.length).toBeGreaterThan(0);
  });

  it('re-entrant guard: running=true skips cycle', async () => {
    const { placeMarketOrder } = await import('../src/api/hyperliquid');
    useHarvestStore.setState({ config: { ...DEFAULT_CONFIG, enabled: true }, running: true });
    await useHarvestStore.getState().runCycle();
    expect(placeMarketOrder).not.toHaveBeenCalled();
  });
});

// ── F-02 / Phase 1.5 ─────────────────────────────────────────────────────────
describe('F-02 signer path', () => {
  beforeEach(() => { resetAllStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ENTER with no signer → ENTER_FAILED, no order', async () => {
    const { placeMarketOrder, fetchAccountState } = await import('../src/api/hyperliquid');
    const { detectInjectedWallet } = await import('../src/api/signing');
    vi.mocked(detectInjectedWallet).mockReturnValue(null);
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);

    connectWallet(false);
    enableEngine();
    addPair('ETH', 0.5, 2000);

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({
      actions: [{ type: 'ENTER', symbol: 'ETH' }] as any, logLines: [],
    });

    await useHarvestStore.getState().runCycle();

    expect(placeMarketOrder).not.toHaveBeenCalled();
    expect(useHarvestStore.getState().log.some(l => l.type === 'ENTER_FAILED')).toBe(true);
    spy.mockRestore();
  });

  it('ENTER with agent signer → placeMarketOrder called with signer', async () => {
    const { placeMarketOrder, fetchAccountState } = await import('../src/api/hyperliquid');
    const { detectInjectedWallet } = await import('../src/api/signing');
    vi.mocked(detectInjectedWallet).mockReturnValue(null);
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    vi.mocked(placeMarketOrder).mockResolvedValue({ success: true, orderId: '42', filledAsMaker: false });

    const walletMod = await import('../src/hooks/useWallet');
    const mockSigner = { signTypedData: vi.fn().mockResolvedValue('0xsig') } as any;
    vi.spyOn(walletMod, 'getActiveSigner').mockReturnValue(async () => mockSigner);

    connectWallet(true);
    enableEngine();
    addPair('ETH', 0.5, 2000);

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({
      actions: [{ type: 'ENTER', symbol: 'ETH' }] as any, logLines: [],
    });

    await useHarvestStore.getState().runCycle();

    expect(placeMarketOrder).toHaveBeenCalledWith(
      expect.objectContaining({ coin: 'ETH', isBuy: false, signer: mockSigner })
    );
    spy.mockRestore();
  });
});

// ── RB-05 / Phase 1.6 ────────────────────────────────────────────────────────
describe('RB-05 WalletConnect gate', () => {
  beforeEach(() => { resetAllStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('WalletConnect-only → ENTER_FAILED with WalletConnect mention, no order', async () => {
    const { placeMarketOrder, fetchAccountState } = await import('../src/api/hyperliquid');
    const { detectInjectedWallet } = await import('../src/api/signing');
    vi.mocked(detectInjectedWallet).mockReturnValue(null);
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);

    useAppStore.setState({
      wallet: {
        address: '0xWC', connected: true, balance: 10000, network: 'mainnet',
        canTradeAutonomously: false, method: 'walletconnect',
        walletName: 'WalletConnect', agentAddress: null,
      },
    });
    enableEngine();
    addPair('BTC', 0.3, 60000);

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({
      actions: [{ type: 'ENTER', symbol: 'BTC' }] as any, logLines: [],
    });

    await useHarvestStore.getState().runCycle();

    expect(placeMarketOrder).not.toHaveBeenCalled();
    const fail = useHarvestStore.getState().log.find(l => l.type === 'ENTER_FAILED');
    expect(fail).toBeTruthy();
    expect(fail!.message).toMatch(/WalletConnect/i);
    spy.mockRestore();
  });
});

// ── P0-04 / Phase 4.1: hoursHeld ─────────────────────────────────────────────
describe('P0-04 hoursHeld', () => {
  beforeEach(() => { resetAllStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('hoursHeld updates after advancing time', async () => {
    const { fetchAccountState } = await import('../src/api/hyperliquid');
    const { detectInjectedWallet } = await import('../src/api/signing');
    vi.mocked(detectInjectedWallet).mockReturnValue(null);
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);

    const entryTime = 1_000_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(entryTime);

    usePositionStore.setState({
      positions: [{
        id: 'p1', symbol: 'ETH', entryTime, entryPrice: 2000, entryRate: 0.5,
        notional: 500, fundingEarned: 0, feesPaid: 5, currentPrice: 2000,
        currentRate: 0.5, hedgeDrift: 0, hoursHeld: 0,
      }],
      trades: [],
    });

    connectWallet(false);
    enableEngine();
    addPair('ETH', 0.5, 2000);

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({ actions: [], logLines: [] });

    vi.setSystemTime(entryTime + 5 * 3_600_000);
    await useHarvestStore.getState().runCycle();

    expect(usePositionStore.getState().positions[0].hoursHeld).toBe(5);
    spy.mockRestore();
  });
});

// ── P0-03 / Phase 4.2: funding accrual ───────────────────────────────────────
describe('P0-03 funding accrual', () => {
  beforeEach(() => { resetAllStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('fundingEarned SET to cumFunding.sinceOpen (not summed) across two cycles', async () => {
    const { fetchAccountState } = await import('../src/api/hyperliquid');
    const { detectInjectedWallet } = await import('../src/api/signing');
    vi.mocked(detectInjectedWallet).mockReturnValue(null);

    usePositionStore.setState({
      positions: [{
        id: 'p1', symbol: 'BTC', entryTime: Date.now(), entryPrice: 60000, entryRate: 0.3,
        notional: 500, fundingEarned: 0, feesPaid: 5, currentPrice: 60000,
        currentRate: 0.3, hedgeDrift: 0, hoursHeld: 0,
      }],
      trades: [],
    });

    connectWallet(false);
    enableEngine();
    addPair('BTC', 0.3, 60000);

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({ actions: [], logLines: [] });

    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{ position: { coin: 'BTC', szi: '-0.008', entryPx: '60000', cumFunding: { sinceOpen: '1.50', allTime: '5.00' } } }],
    } as any);
    await useHarvestStore.getState().runCycle();
    expect(usePositionStore.getState().positions[0].fundingEarned).toBe(1.50);

    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{ position: { coin: 'BTC', szi: '-0.008', entryPx: '60000', cumFunding: { sinceOpen: '3.20', allTime: '7.00' } } }],
    } as any);
    await useHarvestStore.getState().runCycle();
    // Must be 3.20, NOT 1.50+3.20=4.70
    expect(usePositionStore.getState().positions[0].fundingEarned).toBe(3.20);
    spy.mockRestore();
  });
});
