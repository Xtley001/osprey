/**
 * 02-lp-metadata.ts
 *
 * Sets LP token name, symbol, and metadata URI.
 *
 * Before running:
 *   1. Upload metadata.json to IPFS (nft.storage free) or your CDN
 *   2. Set METADATA_URI below (or in .env)
 *
 * metadata.json minimum content:
 * {
 *   "name": "Osprey Delta-Neutral Yield",
 *   "symbol": "OSPREY",
 *   "description": "Regime-gated HL funding + Kamino lending vault",
 *   "image": "https://osprey-three.vercel.app/osprey-icon.svg"
 * }
 */

import { VoltrClient } from "@voltr/vault-sdk";
import {
  Connection, Keypair, PublicKey,
  sendAndConfirmTransaction, Transaction,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const connection = new Connection(process.env.RPC_URL!, "confirmed");
  const adminKp    = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.ADMIN_KEYPAIR!))
  );
  const vault  = new PublicKey(process.env.VAULT_ADDRESS!);
  const client = new VoltrClient(connection);

  // Upload your metadata.json first and set this URI
  const metadataUri = process.env.METADATA_URI
    ?? "https://osprey-three.vercel.app/lp-metadata.json";

  console.log("Setting LP token metadata...");
  console.log("  URI:", metadataUri);

  const ix = await client.createCreateLpMetadataIx(
    {
      name:   "Osprey Delta-Neutral Yield",
      symbol: "OSPREY",
      uri:    metadataUri,
    },
    {
      payer: adminKp.publicKey,
      admin: adminKp.publicKey,
      vault,
    },
  );

  const tx  = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [adminKp]);

  console.log("✅ LP metadata set. Sig:", sig);
}

main().catch((e) => { console.error(e); process.exit(1); });
