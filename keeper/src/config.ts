import * as dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  rpcUrl:                  required("RPC_URL"),
  adminKeypair:            JSON.parse(required("ADMIN_KEYPAIR")) as number[],
  managerKeypair:          JSON.parse(required("MANAGER_KEYPAIR")) as number[],
  vaultAddress:            required("VAULT_ADDRESS"),
  kaminoStrategyAddress:   required("KAMINO_STRATEGY_ADDRESS"),
  trustfulStrategyAddress: required("TRUSTFUL_STRATEGY_ADDRESS"),
  usdcMint:                required("USDC_MINT"),
  hlApiUrl:                required("HL_API_URL"),
  hlPrivateKey:            required("HL_PRIVATE_KEY"),
  hlWalletAddress:         required("HL_WALLET_ADDRESS"),
  ospreyApiUrl:            required("OSPREY_API_URL"),
  databaseUrl:             required("DATABASE_URL"),
  redisUrl:                required("REDIS_URL"),

  // Loop intervals (ms)
  rebalanceInterval:    15 * 60 * 1000,    // 15 minutes
  markToMarketInterval: 60 * 60 * 1000,    // 1 hour
  riskMonitorInterval:  5  * 60 * 1000,    // 5 minutes
  feeHarvestInterval:   6  * 60 * 60 * 1000, // 6 hours
} as const;
