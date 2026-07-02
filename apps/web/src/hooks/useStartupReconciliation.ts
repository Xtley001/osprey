/**
 * useStartupReconciliation — Phase 5.2 / P0-06 / ST-05
 *
 * After rehydration and once wallet.connected + wallet.address is available,
 * reconciles local positionStore state with the live HL account:
 *
 *   MATCH:        update fundingEarned + entryPrice from live HL data
 *   ORPHAN-ON-HL: adopt unknown HL positions into tracking (with a warning)
 *   ORPHAN-LOCAL: close locally-tracked positions that no longer exist on HL
 *
 * Mounted once in App.tsx / AppShell via:
 *   useStartupReconciliation();
 */

import { useEffect, useRef } from 'react';
import { useAppStore }      from '../store/appStore';
import { usePositionStore } from '../store/positionStore';
import { fetchAccountState } from '@osprey/engine';
import { toast }             from '../components/shared/Toast';

export function useStartupReconciliation() {
  const wallet    = useAppStore(s => s.wallet);
  const hasRun    = useRef(false);

  useEffect(() => {
    // Run once per wallet connection, not on every render
    if (!wallet.connected || !wallet.address || hasRun.current) return;
    hasRun.current = true;

    async function reconcile() {
      try {
        const acct = await fetchAccountState(wallet.address!);
        if (!acct) return;

        const localPositions = usePositionStore.getState().positions;
        const hlPositions    = acct.positions ?? [];

        // ── MATCH / ORPHAN-ON-HL ──────────────────────────────────────────────
        for (const hlPos of hlPositions) {
          const coin = hlPos.position.coin;
          const szi  = parseFloat(hlPos.position.szi ?? '0');
          if (szi === 0) continue;   // closed on HL, handled below

          const local = localPositions.find(p => p.symbol === coin);
          const cumFunding = parseFloat(hlPos.position.cumFunding?.sinceOpen ?? '0');
          const entryPx    = parseFloat(hlPos.position.entryPx ?? '0');

          if (local) {
            // MATCH — sync funding + entryPrice from authoritative HL source
            usePositionStore.getState().updatePosition(local.id, {
              fundingEarned: isFinite(cumFunding) ? cumFunding : local.fundingEarned,
              entryPrice:    isFinite(entryPx) && entryPx > 0 ? entryPx : local.entryPrice,
            });
          } else {
            // ORPHAN-ON-HL — adopt into tracking with a user-visible warning
            const notional = Math.abs(szi) * entryPx;
            console.warn(`[Reconcile] Adopting unmanaged HL position: ${coin} (sz=${szi}, entryPx=${entryPx})`);
            toast.warning(
              `Unmanaged position detected: ${coin} $${notional.toFixed(0)} — adopted into tracking. Entry time unknown.`
            );
            usePositionStore.getState().openPosition({
              symbol:       coin,
              entryTime:    Date.now(),   // real entry time unknown — logged above
              entryPrice:   isFinite(entryPx) ? entryPx : 0,
              entryRate:    0,            // unknown
              notional:     notional,
              fundingEarned: isFinite(cumFunding) ? cumFunding : 0,
              feesPaid:     0,            // unknown — logged
              currentPrice: isFinite(entryPx) ? entryPx : 0,
              currentRate:  0,
              hedgeDrift:   0,
              hoursHeld:    0,
            });
          }
        }

        // ── ORPHAN-LOCAL — close local positions not present on HL ───────────
        const hlCoins = new Set(
          hlPositions
            .filter(p => parseFloat(p.position.szi ?? '0') !== 0)
            .map(p => p.position.coin)
        );

        const orphanedLocal = localPositions.filter(p => !hlCoins.has(p.symbol));
        for (const local of orphanedLocal) {
          console.warn(`[Reconcile] Position ${local.symbol} not found on HL — removing local tracking entry`);
          usePositionStore.getState().closePosition(local.id);
        }
        if (orphanedLocal.length > 0) {
          toast.info(
            `${orphanedLocal.length} position(s) not found on HL and removed from local tracking (may have been closed externally).`
          );
        }
      } catch (err) {
        console.error('[Reconcile] Startup reconciliation failed:', err);
      }
    }

    reconcile();
  }, [wallet.connected, wallet.address]);

  // Reset hasRun when wallet disconnects so next connection triggers reconcile
  useEffect(() => {
    if (!wallet.connected) {
      hasRun.current = false;
    }
  }, [wallet.connected]);
}
