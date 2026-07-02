# Osprey API + SDK — Architecture & Build Plan

Status: **in progress**. This document is the design reference for turning Osprey from a single-user browser app into infrastructure that funds and firms can integrate against. It is written to be read before touching code — every phase below references exact current files and states exactly what changes.

---

## 1. Why this exists

Osprey today is an excellent single-tenant, browser-only delta-neutral funding harvester (see [`INTERNALS.md`](../../INTERNALS.md) for how the engine itself works). The gap between that and "the funding rate engine institutions integrate with" is entirely infrastructural, not algorithmic:

- No process can run the harvest loop without a browser tab open.
- No two parties can use one deployment — every wallet needs its own browser session.
- Nothing exposes engine decisions or account state as a network API.
- There is no client library — anyone wanting programmatic access would have to reverse-engineer `src/`.

The engine logic itself (`src/engine/*.ts`, `src/api/hyperliquid.ts`, `src/api/fees.ts`) does not need to change. It's already pure TypeScript with zero React dependency and a passing test suite (see [`TESTING.md`](../../TESTING.md)). This plan is about **giving that logic a server-shaped home and a documented client contract** — not rewriting the funding-rate math.

## 2. Non-goals (explicit, to prevent scope creep)

- No new trading strategies or signal logic beyond what `src/engine/` already does.
- No exchanges beyond Hyperliquid.
- No new UI. The existing web app keeps working exactly as it does today; it becomes one client of the new engine package rather than the only one.
- No premature abstraction — build the REST/WebSocket surface the engine actually needs, not a speculative "generic trading platform API."
- No managed hosting decisions baked into the code (Docker + a documented deploy target, not a lock-in to one cloud).

## 3. Target shape: a monorepo

```text
osprey/
├── apps/
│   └── web/                 ← today's src/ (Vite/React app), unchanged behavior
├── packages/
│   ├── engine/               ← @osprey/engine — extracted pure logic (Phase A)
│   ├── server/                ← @osprey/server — backend API (Phase B, private, not published)
│   └── sdk/                   ← @osprey/sdk — publishable TS client (Phase C)
├── package.json              ← npm workspaces root
└── [README.md, SETUP.md, TESTING.md, INTERNALS.md, LICENSE — unchanged]
```

npm workspaces (not a heavier tool like Nx/Turborepo) — the project is three packages plus one app, workspaces alone are sufficient and add zero new tooling surface.

---

## Phase A — Extract the engine into `@osprey/engine`

**Goal:** move the already-portable logic into its own package with zero behavior change, verified by the existing test suite passing unmodified.

### What moves (verified portable — no `window`, `document`, or `localStorage` references)

| From | To |
|---|---|
| `src/engine/harvest.ts` | `packages/engine/src/harvest.ts` |
| `src/engine/signals.ts` | `packages/engine/src/signals.ts` |
| `src/engine/regime.ts` | `packages/engine/src/regime.ts` |
| `src/engine/deltaHedge.ts` | `packages/engine/src/deltaHedge.ts` |
| `src/engine/portfolio.ts` | `packages/engine/src/portfolio.ts` |
| `src/api/hyperliquid.ts` | `packages/engine/src/hyperliquid.ts` |
| `src/api/fees.ts` | `packages/engine/src/fees.ts` |
| `src/types/*.ts` | `packages/engine/src/types/*.ts` |
| `src/utils/constants.ts`, `format.ts`, `rateColor.ts` | `packages/engine/src/utils/*.ts` |
| `engine-tests/*` | `packages/engine/test/*` |

### What does NOT move (browser-bound, stays in `apps/web`)

- `src/engine/HarvestService.tsx` — a React effect hook, imports `@osprey/engine` instead.
- `src/api/signing.ts` — **split, not moved wholesale**. See below.
- `src/api/walletConnect.ts` — WalletConnect v2 browser SDK integration, inherently client-side.
- All of `src/store/`, `src/pages/`, `src/components/`, `src/hooks/` — React/Zustand-coupled UI layer.
- `store-tests/*` — tests the Zustand orchestration layer, stays with the app.

### `signing.ts` needs to be split, not extracted as-is

This was checked directly against the file (`src/api/signing.ts`), not assumed. It currently mixes three concerns:

1. **Browser wallet detection & connection** (`detectInjectedWallet`, `getInjectedWalletName`, the `browser`/`walletconnect_auth_only` branches of `buildSigner`) — uses `window.ethereum` and `ethers.BrowserProvider`. Browser-only, stays in `apps/web`.
2. **Agent key generation and raw signing** (`generateAgentKey`, the `agentKey` branch of `buildSigner`, `buildApproveAgentPayload`) — pure, portable. Moves to `packages/engine`.
3. **Agent key encryption at rest** (`encryptAgentKey`/`decryptAgentKey`, PBKDF2 + password) — this is a **browser-UX-specific scheme** (a human types a password to unlock a key in their own browser session). It does not fit a headless multi-tenant server, where there's no human present to type a password per cycle. **This does not move.** The server needs its own key-custody design — see Phase B, Secrets.

### Package setup

- `packages/engine/package.json`: `name: "@osprey/engine"`, `private: true` initially (not published until the API surface is deliberately versioned — see Phase C).
- Own `tsconfig.json` extending a shared base, own `vitest.config.ts` for the moved `engine-tests/`.
- `apps/web`'s `package.json` gets `"@osprey/engine": "workspace:*"` and all `import ... from '../engine/harvest'`-style relative imports become `import ... from '@osprey/engine'`.

### Verification

- `npm test` inside `packages/engine` — all tests that currently live in `engine-tests/` pass unchanged (same assertions, only import paths differ).
- `npm run typecheck` and `npm run build` at the root (workspace-aware) succeed.
- `apps/web` boots and the Scanner/Harvest pages behave identically — this is a pure refactor, not a behavior change.

---

## Phase B — `@osprey/server`: the backend service

**Goal:** run the harvest loop headlessly, per tenant, and expose it over REST + WebSocket. This is genuinely new code, not extraction — the current architecture has no equivalent.

### Stack decision

- **Runtime:** Node.js + TypeScript (per your earlier decision — reuses `@osprey/engine` directly, one language across the stack).
- **HTTP framework:** [Fastify](https://fastify.dev/). Chosen over Express for native TypeScript support, a built-in schema-validation story (important for an API external firms integrate against — request/response shapes should be enforced, not just typed), and a mature WebSocket plugin (`@fastify/websocket`). Lighter than Nest, more structured than bare Express.
- **Database:** PostgreSQL. Multi-tenant position/trade/account history needs a real database — the current `localStorage`-only model (`positionStore.ts`) doesn't carry over to a server with many tenants.
- **ORM/query layer:** [Drizzle](https://orm.drizzle.team/). TypeScript-first, SQL-close (matters for a quant system where you want to see the exact query, not an ORM abstraction hiding cost), lighter than Prisma, no separate codegen step blocking iteration.
- **Scheduler:** start with a simple in-process interval loop, one per active tenant, with a Postgres row lock (`SELECT ... FOR UPDATE SKIP LOCKED`) to guarantee only one process runs a given tenant's cycle at a time. This avoids introducing Redis/BullMQ before there's evidence of needing distributed job scheduling — note the upgrade path in the code, don't build it prematurely.

### Data model (new — nothing here exists today)

```text
tenants
  id, name, api_key_hash, api_key_prefix, created_at

tenant_credentials
  tenant_id, hl_account_address, agent_key_ciphertext, agent_key_dek_wrapped, encryption_version

tenant_config
  tenant_id, harvest_config (jsonb — same shape as HarvestConfig from @osprey/engine/types)

positions
  id, tenant_id, symbol, side, entry_price, perp_notional, spot_notional, opened_at, closed_at, status

trades
  id, tenant_id, position_id, action, price, size, fee, executed_at

equity_snapshots
  id, tenant_id, equity, recorded_at   -- replaces the browser-only equityCurveStore

harvest_log
  id, tenant_id, level, message, recorded_at
```

This is a direct server-side analog of `positionStore.ts` / `equityCurveStore.ts` / `harvestStore.ts`'s in-browser state — same shapes, different home.

### Secrets: server-side agent key custody

This is the one piece of Phase B with no existing analog to extract — the browser app's PBKDF2-password model assumes an interactive human. A server holding agent keys for many tenants needs **envelope encryption**:

1. A master key (KMS-backed — AWS KMS, GCP KMS, or self-hosted via `age`/Vault — pick one at implementation time, don't hardcode a provider into the design) encrypts a per-tenant Data Encryption Key (DEK).
2. The DEK encrypts the tenant's agent key private key (AES-256-GCM, same primitive already used client-side — keep the crypto choice consistent, change only the key-management model).
3. The wrapped DEK is stored in `tenant_credentials.agent_key_dek_wrapped`; the master key never touches disk unencrypted, lives only in the KMS.
4. Decryption happens in-memory, per cycle, never logged, zeroed after use.

Document this clearly for firms doing security diligence — this is exactly the kind of thing a fund's infosec team will ask about before integrating.

### API surface — mapped 1:1 to what the engine already does, nothing invented

**REST:**
```text
POST   /v1/tenants                       — provision a tenant, returns API key (shown once)
GET    /v1/rates                         — current funding rates for all pairs (public, no auth — same data Scanner shows)
GET    /v1/positions                     — tenant's open positions
GET    /v1/trades                        — tenant's trade history
GET    /v1/portfolio                     — equity, P&L summary (mirrors Analytics.tsx's data needs)
GET    /v1/config                        — current HarvestConfig
PUT    /v1/config                        — update HarvestConfig
POST   /v1/engine/arm                    — arm the engine (mirrors ArmEngineModal flow)
POST   /v1/engine/enable                 — start the harvest loop for this tenant
POST   /v1/engine/disable                — stop it
GET    /v1/engine/status                 — armed/running state, regime, last cycle summary
```

**WebSocket** (`/v1/stream`): rate updates, position updates, harvest log lines — the server-side equivalent of what `scannerStore`/`harvestStore` push into the React UI today, pushed to any connected SDK client instead.

### Verification

- Integration tests against a real Postgres (via `testcontainers` or a docker-compose service in CI) covering: tenant provisioning, config round-trip, a mocked harvest cycle writing positions/trades, and the WebSocket stream emitting on a mocked rate update.
- The existing `store-tests/harvestStore.test.ts` pattern (mock `@osprey/engine`'s HL API calls, assert on orchestration) is the right model to reuse for `packages/server`'s cycle-runner tests.

---

## Phase C — `@osprey/sdk`: the published client

**Goal:** a typed TypeScript client that funds/firms actually import, wrapping Phase B's API.

### Design

```ts
import { Osprey } from '@osprey/sdk';

const osprey = new Osprey({ apiKey: 'sk_live_...', baseUrl: 'https://api.osprey.xyz' });

const rates = await osprey.rates.list();
const positions = await osprey.positions.list();
await osprey.config.update({ entryThreshold: 0.0001 });
await osprey.engine.enable();

osprey.stream.on('position:update', (p) => { ... });
osprey.stream.on('rate:update', (r) => { ... });
```

- Thin: the SDK's job is typed HTTP/WS calls and reconnection handling, not reimplementing engine logic. It does **not** depend on `@osprey/engine` — that package is `private: true` and never published, so an external consumer installing `@osprey/sdk` from npm would have no way to resolve it. The SDK defines its own local request/response types (`packages/sdk/src/types.ts`) that mirror the shapes `@osprey/engine`'s types produce. This is intentional duplication, not an oversight: the public API contract and the internal engine's types are different concerns that should be free to version independently — a wire-format types package should never accidentally break because an internal refactor renamed an internal type.
- Ships both ESM and CJS builds (`tsup` — minimal config, standard for small TS packages).
- Versioned independently from the server (semver, starting `0.1.0` — pre-1.0 while the API surface is still being validated against the first real integrations).

### Verification

- Contract tests: run the SDK against a running `packages/server` instance (or a mock server built from the same OpenAPI/schema Fastify generates) to catch drift between what the SDK expects and what the server returns.
- A minimal example script in `packages/sdk/examples/` that a fund's engineer could actually run.

---

## Sequencing

1. **Phase A** (mechanical, low risk, do first): monorepo scaffold + engine extraction. Verified by the existing 104 tests passing unchanged.
2. **Phase B** (the real build): server skeleton → data model → auth → cycle runner → REST → WebSocket → secrets/KMS integration, roughly in that order. Each step should be independently testable before the next starts.
3. **Phase C**: SDK, once Phase B's API shape has been exercised by at least the web app being ported to optionally use it (or a manual integration test), so the SDK isn't documenting an API that's still shifting.

## Open decisions to make during implementation (not now)

- KMS provider (AWS/GCP/self-hosted) — depends on where the server ends up deployed.
- Deployment target for `packages/server` (Fly.io/Railway/a VPS/etc.) — affects the KMS choice above.
- Rate limiting / billing model for tenants — out of scope for the first working version, needed before any real external firm goes live.
