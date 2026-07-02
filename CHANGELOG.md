# Changelog

All notable changes to Osprey are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-07-01

First tracked release. Prior development (scanner, harvest engine, portfolio construction, regime detection, delta-hedge management, wallet/agent-key signing, and the Phase 1–7 remediation pass documented in `docs/internal/`) predates this changelog and is summarized in [INTERNALS.md](./INTERNALS.md).

### Added
- Project standard files: `LICENSE` (MIT), `CONTRIBUTING.md`, this changelog.

### Changed
- Repository re-initialized with a clean history scoped to this project (previous git history was accidentally rooted at the OS user profile level and contained unrelated projects).
- Internal audit/remediation documents (`PROGRESS.md`, `UPDATE_AUDIT.md`, `osprey-audit-report-v3.md`) moved to `docs/internal/`.
- README, SETUP.md, TESTING.md, and INTERNALS.md corrected to remove stale references to Backtester and Demo Mode (both removed in the Phase 1 remediation) and to match the current `src/` file structure and test suite.
- `@eslint/js` pinned to `^9.12.0` to match `eslint: ^9.12.0` — it had drifted to `^10.0.1`, which requires a peer `eslint@^10`, breaking `npm ci`/CI installs.
- `jsdom` pinned to `^26.0.0` (down from `^29.0.1`) — newer jsdom majors ship a transitive `html-encoding-sniffer` release with a broken ESM/CJS interop bug under Node 18, and jsdom 27+ requires Node 20+. Revisit this pin once the project's minimum Node version is raised.

### Removed
- Empty `src/components/account/` directory.
- Unused Jekyll scaffolding (`docs/_config.yml`, `docs/.nojekyll`).
