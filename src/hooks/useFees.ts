/**
 * useFees — React hook for live fee access.
 *
 * Auto-fetches fees when wallet connects. Components
 * use `fees.perpTaker`, `fees.perpMaker`, etc. — never hardcoded values.
 *
 * Usage:
 *   const { fees, loading, breakEvenHours } = useFees();
 *   const roundTrip = fees.roundTripRate; // always current
 */

import { useEffect } from 'react';
import { useFeeStore } from '../store/feeStore';
import { useAppStore } from '../store/appStore';

export function useFees() {
  const { fees, loading, error, fetchFees } = useFeeStore();
  const wallet = useAppStore(s => s.wallet);

  // Fetch fees when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      fetchFees(wallet.address);
    }
  }, [wallet.connected, wallet.address, fetchFees]);

  return {
    fees,
    loading,
    error,
    isLive:        fees.source === 'live',
    breakEvenHours: useFeeStore.getState().breakEvenHours,
  };
}
