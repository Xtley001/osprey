/**
 * strategy/rebalancer.ts
 *
 * Main rebalance loop — runs every 15 minutes.
 * Reads regime from Osprey, computes target allocation,
 * then moves capital between Kamino and Hyperliquid accordingly.
 *
 * NOTE: Cross-chain USDC bridging (Solana ↔ Hyperliquid) is not
 * automated in v1. The bot computes the delta and logs the instruction.
 * v2 will integrate Circle CCTP or Wormhole for automated bridging.
 */

import { Connection } from "@solana/web3.js";
import { VoltrClient } from "@voltr/vault-sdk";
import { fetchRegime } from "../signal/client";
import { computeTargetAllocation, needsRebalance } from "./allocator";
import { computeRebalanceDelta } from "./sizing";
import { getVaultTotalValue } from "../vault/client";
import { depositKamino, withdrawKamino } from "../vault/kamino";
import { getHlUsdcBalance, getFundingRate } from "../exchange/hyperliquid";
import { log, logRebalance } from "../reporting/logger";
import { RISK_LIMITS } from "../risk/limits";
import { config } from "../config";

export async function rebalanceLoop(
  client:     VoltrClient,
  connection: Connection,
): Promise<void> {
  log("info", "rebalancer.tick", "Rebalance loop tick");

  // 1. Fetch current state
  const regimeSignal = await fetchRegime();
  const totalNav     = await getVaultTotalValue(client);
  const hlBalance    = await getHlUsdcBalance(config.hlWalletAddress);
  const fundingRate  = await getFundingRate(regimeSignal.topPair);  // hourly rate
  const fundingAnn   = fundingRate * 24 * 365;                      // annualised

  const currentHlPct = totalNav > 0 ? hlBalance / totalNav : 0;

  // 2. Compute target allocation
  const target = computeTargetAllocation(
    regimeSignal.regime,
    regimeSignal.confidence,
    fundingAnn,
  );

  log("info", "rebalancer.state", JSON.stringify({
    regime:        regimeSignal.regime,
    confidence:    regimeSignal.confidence.toFixed(2),
    totalNav:      totalNav.toFixed(2),
    hlBalance:     hlBalance.toFixed(2),
    currentHlPct:  currentHlPct.toFixed(3),
    targetHlPct:   target.hlPct.toFixed(3),
    fundingAnn:    (fundingAnn * 100).toFixed(2) + "%",
  }));

  // 3. Check if rebalance is needed
  if (!needsRebalance(currentHlPct, target.hlPct)) {
    log("info", "rebalancer.skip", "Within threshold — no rebalance needed");
    return;
  }

  const delta = computeRebalanceDelta(totalNav, target.hlPct, hlBalance);

  // Skip tiny deltas — not worth the gas
  if (Math.abs(delta) < RISK_LIMITS.MIN_REBALANCE_USDC) {
    log("info", "rebalancer.skip", `Delta ${delta.toFixed(2)} USDC below minimum — skipping`);
    return;
  }

  log("info", "rebalancer.execute", `Rebalancing. Delta: ${delta.toFixed(2)} USDC`);

  if (delta > 0) {
    // Need MORE in HL → withdraw from Kamino, bridge to HL
    await withdrawKamino(client, connection, delta);
    // v1: log manual bridge instruction
    // v2: automate with Circle CCTP
    log("warn", "rebalancer.bridge",
      `ACTION REQUIRED: Transfer ${delta.toFixed(2)} USDC from Solana wallet to HL wallet (${config.hlWalletAddress}). ` +
      `Then open short on ${regimeSignal.topPair}.`
    );
  } else {
    // Need LESS in HL → close partial short, bridge back to Kamino
    const reduceAmt = Math.abs(delta);
    log("warn", "rebalancer.bridge",
      `ACTION REQUIRED: Withdraw ${reduceAmt.toFixed(2)} USDC from HL wallet and bridge to Solana.`
    );
    await depositKamino(client, connection, reduceAmt);
  }

  await logRebalance({
    timestamp:   new Date(),
    regime:      regimeSignal.regime,
    totalNav,
    hlBalance,
    kaminoBalance: totalNav - hlBalance,
    targetHlPct:   target.hlPct,
    actualHlPct:   currentHlPct,
    delta,
    fundingRate,
    executed: true,
  });
}
