# Contributing to Osprey

Osprey is currently maintained by a single author. Issues and pull requests are welcome, but please open an issue to discuss non-trivial changes before submitting a PR — this keeps the engine's scope tight and avoids wasted work.

## Development setup

See [SETUP.md](./SETUP.md) for environment configuration. Quick start:

```bash
npm install
npm run dev
```

## Before submitting a PR

```bash
npm run typecheck   # tsc --noEmit, must be clean
npm test            # vitest run, all tests must pass
npm run lint         # eslint src --ext .ts,.tsx
npm run build        # production build must succeed
```

See [TESTING.md](./TESTING.md) for the test suite structure and how to add new tests.

## Scope

Osprey's core engine logic (`src/engine/`, `src/api/`) is intentionally minimal and focused on delta-neutral funding rate harvesting on Hyperliquid. PRs that add unrelated exchanges, strategies, or UI surface without a prior issue discussion will likely be declined — see [INTERNALS.md](./INTERNALS.md) for the architecture and design rationale.

## Reporting security issues

Do not open a public issue for security vulnerabilities (e.g. key handling, signing, order execution). Email the maintainer directly instead.
