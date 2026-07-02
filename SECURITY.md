# Security Policy

Osprey places real orders with real capital on Hyperliquid. This document covers how to report vulnerabilities, the trust model, and the risks you accept by running it.

## Reporting a vulnerability

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/Xtley001/osprey/security/advisories/new). Do not open a public issue for anything exploitable. You can expect an acknowledgement within 72 hours.

## Audit status

Osprey is beta software and has not been audited. Do not deploy capital you cannot afford to lose, and review the code yourself before running live.

## Trust model

- **Non-custodial** — funds stay in the Hyperliquid clearinghouse. Osprey never holds balances.
- **Agent Keys cannot withdraw** — the automated engine signs orders with a secondary EOA authorized via Hyperliquid's `approveAgent`. A compromised agent key allows position manipulation, not capital theft. Keys can be revoked at any time from Settings (re-approves the zero address on-chain).
- **Keys encrypted at rest** — agent keys are stored in the browser encrypted with AES-256-GCM, derived from your password via PBKDF2 (600,000 iterations, SHA-256). The raw key is confined to a signing closure and never logged, persisted unencrypted, or sent anywhere except Hyperliquid's signing flow.
- **No backend, no telemetry** — the web app talks only to Hyperliquid endpoints (enforced by the deployed Content-Security-Policy's `connect-src`).

## Operational risk disclosures

| Risk | Description | Mitigation |
|---|---|---|
| Liquidation | Delta-neutral positions can still be liquidated under extreme moves | Liquidation buffer check gates entries |
| Basis | Spot–perp basis can widen, causing paper losses on the hedge | Drift rebalancing at configurable threshold |
| Funding reversal | Rates can go negative — you pay instead of receive | Immediate exit on negative rate |
| Slippage | Market impact on illiquid pairs | OI caps (0.5% of pair OI) limit position size |
| Naked short | Spot leg fails after perp fills | Perp is emergency-closed automatically |
| Agent key compromise | Attacker can open/close positions | Cannot withdraw; revoke on-chain at any time |
| Platform | Funds sit in the Hyperliquid clearinghouse (sovereign L1) | No mitigation — inherent venue risk |

## Supported versions

Only the latest commit on `main` is supported. There are no maintained release branches.
