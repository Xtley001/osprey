/**
 * @osprey/engine — portable delta-neutral funding harvesting logic.
 *
 * Pure TypeScript, no React, no browser globals. Consumed today by the web
 * app (apps/web) and eventually by the headless server (packages/server).
 * See docs/architecture/api-sdk.md for why this package exists.
 */

export * from './engine/harvest';
export * from './engine/signals';
export * from './engine/regime';
export * from './engine/deltaHedge';
export * from './engine/portfolio';

export * from './api/hyperliquid';
export * from './api/fees';

export * from './signing';

export * from './types/account';
export * from './types/funding';
export * from './types/harvest';
export * from './types/position';
export * from './types/portfolio';
// types/wallet.ts re-exports WalletState/ConnectMethod (from account.ts) and
// SignerMode (from signing.ts) under their original names — already exported
// above via `export *` from those modules. Only AgentKeyMeta is unique here.
export type { AgentKeyMeta } from './types/wallet';

export * from './utils/constants';
export * from './utils/format';
export * from './utils/rateColor';
