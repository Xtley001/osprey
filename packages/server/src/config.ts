/**
 * Server config, read from environment. Kept flat and explicit — no config
 * framework needed for this many values.
 */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',

  // Same HL endpoints the web app uses (see apps/web/.env.example) — one
  // source of truth for "which Hyperliquid environment" would live here
  // once this reads from a real per-tenant config; for now it's global.
  hlRestUrl: process.env.HL_REST_URL ?? 'https://api.hyperliquid.xyz',
  hlWsUrl: process.env.HL_WS_URL ?? 'wss://api.hyperliquid.xyz/ws',

  // NOT wired to a real database yet — see docs/architecture/api-sdk.md
  // Phase B. Set to catch anyone assuming persistence exists.
  databaseUrl: process.env.DATABASE_URL ?? null,
} as const;
