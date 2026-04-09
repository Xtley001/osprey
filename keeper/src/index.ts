import http from "http";
import { Connection, Keypair } from "@solana/web3.js";
import { VoltrClient } from "@voltr/vault-sdk";
import { config } from "./config";
import { rebalanceLoop } from "./strategy/rebalancer";
import { markToMarketLoop } from "./reporting/markToMarket";
import { riskMonitorLoop } from "./risk/monitor";
import { initDb, log } from "./reporting/logger";
import { getVaultPubkey } from "./vault/client";

async function main() {
  log("info", "keeper.start", "Keeper bot starting");

  await initDb();

  const connection = new Connection(config.rpcUrl, "confirmed");
  const managerKp = Keypair.fromSecretKey(Uint8Array.from(config.managerKeypair));
  const client = new VoltrClient(connection, managerKp);

  // Validate vault is accessible before starting loops
  const vaultPubkey = getVaultPubkey();
  const vaultAccount = await client.fetchVaultAccount(vaultPubkey);
  log("info", "keeper.vault", `Vault verified. Manager: ${vaultAccount.roles.manager.toBase58()}`);

  // Start all loops — each runs independently; errors logged but don't kill siblings
  runLoop("rebalance",      config.rebalanceInterval,    () => rebalanceLoop(client, connection));
  runLoop("mark-to-market", config.markToMarketInterval, () => markToMarketLoop(client, connection));
  runLoop("risk-monitor",   config.riskMonitorInterval,  () => riskMonitorLoop(client, connection));

  // Health check endpoint for Render
  http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
  }).listen(process.env.PORT ?? 3001, () => {
    log("info", "keeper.health", `Health endpoint listening on :${process.env.PORT ?? 3001}`);
  });

  log("info", "keeper.start", "All loops running");
}

function runLoop(name: string, intervalMs: number, fn: () => Promise<void>): void {
  const tick = async () => {
    try {
      await fn();
    } catch (err) {
      log("error", `keeper.loop.${name}`, `Loop error: ${String(err)}`);
      // Do not rethrow — loop continues
    }
  };

  tick(); // run immediately on start
  setInterval(tick, intervalMs);
}

main().catch((err) => {
  console.error("Fatal keeper error:", err);
  process.exit(1);
});
