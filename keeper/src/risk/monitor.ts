/**
 * risk/monitor.ts
 *
 * Risk monitor loop — runs every 5 minutes.
 * Checks: drawdown from HWM, funding flip, account health.
 * Triggers emergency exit on breach.
 */

import { Connection } from "@solana/web3.js";
import { VoltrClient } from "@voltr/vault-sdk";
import { getVaultTotalValue } from "../vault/client";
import { getAccountSummary } from "../exchange/account";
import { getFundingRate } from "../exchange/hyperliquid";
import { RISK_LIMITS } from "./limits";
import { emergencyExit } from "./emergency";
import { fetchRegime } from "../signal/client";
import { log } from "../reporting/logger";
import { config } from "../config";

// High water mark tracked in memory
// On restart it resets — acceptable; conservative default (HWM starts low = no early exit)
let highWaterMark = 0;

export async function riskMonitorLoop(
  client:     VoltrClient,
  connection: Connection,
): Promise<void> {
  const [totalNav, hlSummary] = await Promise.all([
    getVaultTotalValue(client),
    getAccountSummary(),
  ]);

  // Update high water mark
  if (totalNav > highWaterMark) {
    highWaterMark = totalNav;
  }

  const drawdown = highWaterMark > 0
    ? (highWaterMark - totalNav) / highWaterMark
    : 0;

  log("info", "risk.monitor", JSON.stringify({
    totalNav:   totalNav.toFixed(2),
    hwm:        highWaterMark.toFixed(2),
    drawdown:   (drawdown * 100).toFixed(2) + "%",
    hlEquity:   hlSummary.totalEquity.toFixed(2),
    hlHealth:   hlSummary.accountHealth === Infinity
                  ? "∞" : hlSummary.accountHealth.toFixed(2),
  }));

  // ── Drawdown check ────────────────────────────────────────────────────────
  if (drawdown > RISK_LIMITS.MAX_DRAWDOWN_PCT) {
    log("error", "risk.drawdown",
      `DRAWDOWN LIMIT HIT: ${(drawdown * 100).toFixed(2)}% > ${(RISK_LIMITS.MAX_DRAWDOWN_PCT * 100)}%. Emergency exit.`);
    await emergencyExit(client, connection, "drawdown_limit");
    return;
  }

  // ── Funding rate check ────────────────────────────────────────────────────
  if (hlSummary.positions.length > 0) {
    const regime      = await fetchRegime();
    const fundingRate = await getFundingRate(regime.topPair); // hourly rate
    const fundingAnn  = fundingRate * 24 * 365;

    if (fundingRate < 0 && RISK_LIMITS.NEGATIVE_FUNDING_EXIT) {
      log("error", "risk.funding",
        `Negative funding rate: ${(fundingAnn * 100).toFixed(2)}%/yr. Triggering emergency exit.`);
      await emergencyExit(client, connection, "negative_funding");
      return;
    }

    if (fundingAnn < RISK_LIMITS.MIN_FUNDING_ANNUALISED && regime.regime !== "HOT") {
      log("warn", "risk.funding",
        `Funding below minimum (${(fundingAnn * 100).toFixed(2)}%/yr). Rebalancer will reduce HL on next tick.`);
      // No emergency exit — let rebalancer reduce naturally on next cycle
    }
  }

  // ── Account health check ──────────────────────────────────────────────────
  for (const pos of hlSummary.positions) {
    if (pos.liquidationPx === null) continue;

    const markPx   = parseFloat(pos.entryPx);  // use entry as proxy
    const liqPx    = parseFloat(pos.liquidationPx);

    if (markPx <= 0 || liqPx <= 0) continue;

    // For a short, liq price is above mark price
    const proximity = Math.abs((liqPx - markPx) / markPx);

    if (proximity < RISK_LIMITS.LIQ_PROXIMITY_THRESHOLD) {
      log("error", "risk.health",
        `${pos.coin} is within ${(proximity * 100).toFixed(1)}% of liquidation. Emergency exit.`);
      await emergencyExit(client, connection, "near_liquidation");
      return;
    }
  }
}
