/**
 * ArmEngineModal — P0-09 / R-01 / R-04
 *
 * Shown when the user tries to enable the harvest engine (OFF→ON).
 * Only an explicit "Arm Engine" click calls arm() + toggle() in that order.
 * Dismissing the modal leaves the engine disabled and armed=false.
 *
 * This modal is also the in-app risk disclosure surface (R-04).
 */

import React from 'react';
import { useHarvestStore } from '../../store/harvestStore';

interface ArmEngineModalProps {
  onClose: () => void;
}

const ArmEngineModal: React.FC<ArmEngineModalProps> = ({ onClose }) => {
  const { arm, toggle } = useHarvestStore();

  const handleArm = () => {
    arm();
    toggle();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arm-modal-title"
    >
      <div className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">⚠️</span>
          <h2 id="arm-modal-title" className="text-lg font-semibold text-white">
            Arm Live Trading Engine
          </h2>
        </div>

        <div className="space-y-3 text-sm text-white/70 mb-6">
          <p>
            You are about to enable Osprey's <strong className="text-white">live trading engine</strong>.
            Once armed, it will autonomously place real orders on Hyperliquid using your connected wallet.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Orders execute on mainnet with real capital at risk.</li>
            <li>Funding rates can turn negative — positions may lose money.</li>
            <li>Liquidation risk exists if margin drops below buffer thresholds.</li>
            <li>Osprey does not provide financial advice. Trade at your own risk.</li>
          </ul>
          <p>
            Ensure <strong className="text-white">VITE_ENABLE_TESTNET=true</strong> for testing.
            Only disable testnet mode when you intend to trade real capital.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleArm}
            className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            data-testid="arm-confirm-btn"
          >
            Arm Engine
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArmEngineModal;
