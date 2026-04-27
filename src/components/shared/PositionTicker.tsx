import React, { useEffect } from 'react';
import { usePositionStore } from '../../store/positionStore';
import { useAppStore } from '../../store/appStore';
import { useScannerStore } from '../../store/scannerStore';

const TICK_MS = 1000;

const PositionTicker: React.FC = () => {
  useEffect(() => {
    const id = setInterval(() => {
      // Always read fresh state — never use closure values from render
      const positions = usePositionStore.getState().positions;
      if (positions.length === 0) return;

      const pairs = useScannerStore.getState().pairs;
      const mode  = useAppStore.getState().mode;

      let totalFundingThisTick = 0;

      positions.forEach(pos => {
        // Read fresh position state each tick to avoid accumulation drift
        const freshPos = usePositionStore.getState().positions.find(p => p.id === pos.id);
        if (!freshPos) return;

        const live          = pairs.find(p => p.symbol === freshPos.symbol);
        const currentRate   = live?.currentRate  ?? freshPos.entryRate;
        const currentPrice  = live?.price        ?? freshPos.currentPrice;

        // Funding accrues proportionally per second
        const fundingPerSecond = (currentRate * freshPos.notional) / 3600;

        const hedgeDrift = currentPrice > 0 && freshPos.entryPrice > 0
          ? Math.abs((currentPrice - freshPos.entryPrice) / freshPos.entryPrice) * 100
          : 0;

        const hoursHeld = (Date.now() - freshPos.entryTime) / 3_600_000;

        usePositionStore.getState().updatePosition(freshPos.id, {
          currentRate,
          currentPrice,
          hedgeDrift,
          hoursHeld,
          fundingEarned: freshPos.fundingEarned + fundingPerSecond,
        });

        totalFundingThisTick += fundingPerSecond;
      });

      // Credit demo balance from live funding income
      if (mode === 'demo' && totalFundingThisTick > 0) {
        const demo = useAppStore.getState().demo;
        useAppStore.getState().updateDemo({
          balance:       demo.balance       + totalFundingThisTick,
          fundingEarned: demo.fundingEarned + totalFundingThisTick,
        });
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, []); // mount once, run for app lifetime

  return null;
};

export default PositionTicker;
