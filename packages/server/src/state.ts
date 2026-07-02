/**
 * In-memory single-tenant state — a stand-in for the Postgres-backed,
 * multi-tenant data model described in docs/architecture/api-sdk.md (Phase B).
 *
 * This lets the API surface, request/response shapes, and WebSocket stream
 * be built and tested end-to-end now, without blocking on a database and KMS
 * integration decision. Swapping this module for a real `tenants` /
 * `tenant_config` read/write layer should not require changing any route
 * handler's shape — only where the data comes from.
 *
 * NOT safe for production multi-tenant use as-is: single process, no
 * persistence (state resets on restart), no auth on write endpoints yet.
 */

import { DEFAULT_HARVEST_CONFIG, type HarvestConfig, type HarvestLogEntry } from '@osprey/engine';

interface EngineState {
  config: HarvestConfig;
  armed: boolean;
  running: boolean;
  log: HarvestLogEntry[];
}

const state: EngineState = {
  config: { ...DEFAULT_HARVEST_CONFIG },
  armed: false,
  running: false,
  log: [],
};

export function getEngineState(): EngineState {
  return state;
}

export function updateConfig(partial: Partial<HarvestConfig>): HarvestConfig {
  state.config = { ...state.config, ...partial };
  return state.config;
}

export function arm(): void {
  state.armed = true;
}

export function setRunning(running: boolean): void {
  if (running && !state.armed) throw new Error('engine must be armed before it can run');
  state.running = running;
}

export function appendLog(entry: HarvestLogEntry): void {
  state.log = [entry, ...state.log].slice(0, 500);
}
