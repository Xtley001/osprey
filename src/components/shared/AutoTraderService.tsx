/**
 * AutoTraderService — mounts once in AppShell.
 * Hooks into the rate poll cycle: every time rates refresh, it runs a cycle.
 * Renders nothing — pure side-effect service component.
 */
import React, { useEffect, useRef } from 'react';
import { useAutoTraderStore } from '../../store/autoTraderStore';
import { useScannerStore } from '../../store/scannerStore';

const AutoTraderService: React.FC = () => {
  const runCycle  = useAutoTraderStore(s => s.runCycle);
  const enabled   = useAutoTraderStore(s => s.config.enabled);

  // Watch lastUpdated — whenever scanner gets new data, run auto-trader cycle
  const lastUpdated = useScannerStore(s => s.lastUpdated);
  const prevUpdated = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (lastUpdated === 0) return;
    if (lastUpdated === prevUpdated.current) return;

    prevUpdated.current = lastUpdated;
    // Small delay so scannerStore fully settles before we read pairs
    const t = setTimeout(() => {
      useAutoTraderStore.getState().runCycle();
    }, 500);
    return () => clearTimeout(t);
  }, [lastUpdated, enabled]);

  // Also run once immediately when auto-trader is enabled
  useEffect(() => {
    if (enabled && useScannerStore.getState().pairs.length > 0) {
      setTimeout(() => useAutoTraderStore.getState().runCycle(), 300);
    }
  }, [enabled]);

  return null;
};

export default AutoTraderService;
