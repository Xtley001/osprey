/**
 * HarvestService — mounts once in AppShell.
 * Replaces HarvestService.
 *
 * Hooks into the rate poll cycle: every time scanner gets new data,
 * triggers a harvest cycle. Also runs a simulation interval for demo funding.
 * Renders nothing — pure side-effect service component.
 */
import React, { useEffect, useRef } from 'react';
import { useHarvestStore } from '../store/harvestStore';
import { useScannerStore } from '../store/scannerStore';
import { usePositionStore } from '../store/positionStore';
import { useAppStore } from '../store/appStore';
import { simulateHourlyFunding } from './deltaHedge';

const FUNDING_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour

const HarvestService: React.FC = () => {
  const runCycle  = useHarvestStore(s => s.runCycle);
  const enabled   = useHarvestStore(s => s.config.enabled);
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

  // ── Demo funding simulation: accrue hourly ──────────────────────────────────
  useEffect(() => {
    const mode = useAppStore.getState().mode;
    if (mode !== 'demo' || !enabled) return;

    const interval = setInterval(() => {
      const pairs     = useScannerStore.getState().pairs;
      const positions = usePositionStore.getState().positions;

      for (const pos of positions) {
        if (!pos.isDemo) continue;
        const live = pairs.find(p => p.symbol === pos.symbol);
        if (!live) continue;
        const earned = simulateHourlyFunding({
          perpNotional: pos.notional,
          currentRate:  live.currentRate,
        });
        usePositionStore.getState().creditFunding(pos.id, earned);
      }
    }, FUNDING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled]);

  return null;
};

export default HarvestService;
