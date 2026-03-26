import React, { useEffect } from 'react';
import { usePositionStore } from '../../store/positionStore';
import { useAppStore } from '../../store/appStore';
import { useScannerStore } from '../../store/scannerStore';

const TICK_MS = 1000;

const PositionTicker: React.FC = () => {
  useEffect(() => {
    const id = setInterval(() => {
      const positions = usePositionStore.getState().positions;
      if (positions.length === 0) return;

      const pairs = useScannerStore.getState().pairs;
      const mode  = useAppStore.getState().mode;

      let totalFundingThisTick = 0;

      positions.forEach(pos => {
        const live = pairs.find(p => p.symbol === pos.symbol);
        const currentRate  = live?.currentRate  ?? pos.entryRate;
        const currentPrice = live?.price        ?? pos.currentPrice;

        // Funding per second = hourly_rate * notional / 3600
        const fundingPerSecond = (currentRate * pos.notional) / 3600;
        const hedgeDrift = currentPrice > 0 && pos.entryPrice > 0
          ? Math.abs((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : 0;
        const hoursHeld = (Date.now() - pos.entryTime) / 3_600_000;

        usePositionStore.getState().updatePosition(pos.id, {
          currentRate,
          currentPrice,
          hedgeDrift,
          hoursHeld,
          fundingEarned: pos.fundingEarned + fundingPerSecond,
        });

        totalFundingThisTick += fundingPerSecond;
      });

      if (mode === 'demo' && totalFundingThisTick > 0) {
        const demo = useAppStore.getState().demo;
        useAppStore.getState().updateDemo({
          balance: demo.balance + totalFundingThisTick,
          fundingEarned: demo.fundingEarned + totalFundingThisTick,
        });
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  return null;
};

export default PositionTicker;
