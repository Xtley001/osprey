/**
 * store-tests/phase6.test.ts — Phase 6 / P0-02 / P0-12 / F-01 / O-07 / R-07
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHarvestStore } from '../src/store/harvestStore';
import { useAppStore }     from '../src/store/appStore';
import { usePositionStore } from '../src/store/positionStore';
import { useScannerStore }  from '../src/store/scannerStore';

vi.mock('../src/api/hyperliquid', () => ({
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
    config: { ...DEFAULT_CONFIG }, armed: true, running: false,
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
    }],
  });
}

describe('Phase 6.1 — hl_spot ENTER places both perp and spot legs', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('perp fills + spot fills → openPosition called once', async () => {
    const { placeMarketOrder, placeSpotOrder, fetchAccountState } = await import('../src/api/hyperliquid');
    const walletMod = await import('../src/hooks/useWallet');
    const mockSigner = { signTypedData: vi.fn().mockResolvedValue('0xsig') } as any;
    vi.spyOn(walletMod, 'getActiveSigner').mockReturnValue(async () => mockSigner);
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    // Ioc fill — no polling needed (filledAsMaker: false)
    vi.mocked(placeMarketOrder).mockResolvedValue({ success: true, orderId: '1', filledAsMaker: false });
    vi.mocked(placeSpotOrder).mockResolvedValue({ success: true, orderId: '2', filledAsMaker: false });

    useHarvestStore.setState({ config: { ...DEFAULT_CONFIG, enabled: true, hedgeMode: 'hl_spot' } });

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({
      actions: [{ type: 'ENTER', symbol: 'ETH' }] as any, logLines: [],
    });

    await useHarvestStore.getState().runCycle();

    expect(placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({ coin: 'ETH', isBuy: false }));
    expect(placeSpotOrder).toHaveBeenCalledWith(expect.objectContaining({ coin: 'ETH', isBuy: true }));
    expect(usePositionStore.getState().positions).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('Phase 6.2 — P0-12: emergency unwind on spot failure', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('spot leg fails → perp unwound, no openPosition, ENTER_FAILED logged', async () => {
    const { placeMarketOrder, placeSpotOrder, fetchAccountState, fetchOpenOrders } = await import('../src/api/hyperliquid');
    const walletMod = await import('../src/hooks/useWallet');
    const mockSigner = { signTypedData: vi.fn() } as any;
    vi.spyOn(walletMod, 'getActiveSigner').mockReturnValue(async () => mockSigner);
    vi.mocked(fetchAccountState).mockResolvedValue({
      balance: 10000, marginBuffer: 100,
      positions: [{ position: { coin: 'ETH', szi: '-0.25', entryPx: '2000', cumFunding: { sinceOpen: '0', allTime: '0' } } }],
    } as any);
    vi.mocked(fetchOpenOrders).mockResolvedValue([]);

    // Perp succeeds (Ioc → immediate fill), spot fails
    vi.mocked(placeMarketOrder).mockResolvedValue({ success: true, orderId: '1', filledAsMaker: false });
    vi.mocked(placeSpotOrder).mockResolvedValue({ success: false, error: 'Insufficient spot balance' });

    useHarvestStore.setState({ config: { ...DEFAULT_CONFIG, enabled: true, hedgeMode: 'hl_spot' } });

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({
      actions: [{ type: 'ENTER', symbol: 'ETH' }] as any, logLines: [],
    });

    await useHarvestStore.getState().runCycle();

    // No position should be opened
    expect(usePositionStore.getState().positions).toHaveLength(0);
    // Perp close (unwind) should have been attempted
    expect(placeMarketOrder).toHaveBeenCalledTimes(2); // entry + unwind
    const secondCall = vi.mocked(placeMarketOrder).mock.calls[1][0];
    expect(secondCall.isBuy).toBe(true); // unwind short = buy
    // ENTER_FAILED logged
    expect(useHarvestStore.getState().log.some(l => l.type === 'ENTER_FAILED')).toBe(true);
    spy.mockRestore();
  });
});

describe('Phase 6.3 — R-07: drift rebalance fires when threshold exceeded', () => {
  beforeEach(() => { resetStores(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('position drifted beyond threshold → rebalance spot order placed', async () => {
    const { placeSpotOrder, fetchAccountState } = await import('../src/api/hyperliquid');
    const walletMod = await import('../src/hooks/useWallet');
    const mockSigner = { signTypedData: vi.fn() } as any;
    vi.spyOn(walletMod, 'getActiveSigner').mockReturnValue(async () => mockSigner);
    vi.mocked(fetchAccountState).mockResolvedValue({ balance: 10000, marginBuffer: 100, positions: [] } as any);
    vi.mocked(placeSpotOrder).mockResolvedValue({ success: true, orderId: '99', filledAsMaker: false });

    // Position entered at 2000, current price 2200 → 10% drift, above 2% threshold
    usePositionStore.setState({
      positions: [{
        id: 'p1', symbol: 'ETH', entryTime: Date.now(), entryPrice: 2000, entryRate: 0.5,
        notional: 500, fundingEarned: 5, feesPaid: 5, currentPrice: 2200,
        currentRate: 0.5, hedgeDrift: 0.10, hoursHeld: 3,
      }],
      trades: [],
    });

    // Set current price to 2200 in scanner
    useScannerStore.setState({
      pairs: [{ symbol: 'ETH', currentRate: 0.5, price: 2200, openInterest: 2_000_000,
        nextFundingTime: Date.now() + 3600000, volume24h: 1_000_000,
        predictedRate: 0.5, entryThreshold: 0.10, exitThreshold: 0.05 }],
    });

    useHarvestStore.setState({
      config: { ...DEFAULT_CONFIG, enabled: true, hedgeMode: 'hl_spot', rebalanceThreshold: 0.02 },
    });

    const harvestMod = await import('../src/engine/harvest');
    const spy = vi.spyOn(harvestMod, 'runHarvestCycle').mockReturnValue({ actions: [], logLines: [] });

    await useHarvestStore.getState().runCycle();

    // placeSpotOrder should have been called for the rebalance
    expect(placeSpotOrder).toHaveBeenCalled();
    const log = useHarvestStore.getState().log;
    expect(log.some(l => l.type === 'REBALANCE')).toBe(true);
    spy.mockRestore();
  });
});
