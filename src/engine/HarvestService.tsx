/**
 * HarvestService — mounts once in AppShell.
 * Hooks into the rate poll cycle: every time scanner gets new data,
 * triggers a harvest cycle. Renders nothing — pure side-effect service component.
 *
 * Demo simulation removed (Phase 1). Live funding comes from HL API cumFunding.sinceOpen.
 */
import React, { useEffect, useRef } from 'react';
import { useHarvestStore } from '../store/harvestStore';
import { useScannerStore } from '../store/scannerStore';

const HarvestService: React.FC = () => {
  const enabled     = useHarvestStore(s => s.config.enabled);
  const lastUpdated = useScannerStore(s => s.lastUpdated);
  const prevUpdated = useRef(0);

  // ── Trigger harvest cycle on each rate refresh ──────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (lastUpdated === 0) return;
    if (lastUpdated === prevUpdated.current) return;
    prevUpdated.current = lastUpdated;
    const t = setTimeout(() => useHarvestStore.getState().runCycle(), 500);
    return () => clearTimeout(t);
  }, [lastUpdated, enabled]);

  // ── Run once immediately when engine is enabled ─────────────────────────────
  useEffect(() => {
    if (enabled && useScannerStore.getState().pairs.length > 0) {
      setTimeout(() => useHarvestStore.getState().runCycle(), 300);
    }
  }, [enabled]);

  return null;
};

export default HarvestService;
