---
title: Execution Gateway Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Provides a normalized exchange adapter SDK abstraction so OMS can route to any connector
pack without core rewrites.

## Connector Packs
- FX/CFD
- Equities/F&O
- US Equities/Options
- Crypto CEX
- Commodities

## Canonical Contracts
- Order lifecycle: place/modify/cancel
- Positions and balances snapshots
- Symbol catalog
- Session health state
- Webhook ingestion

## APIs
- POST /execution-gateway/orders/place
- POST /execution-gateway/orders/modify
- POST /execution-gateway/orders/cancel
- GET /execution-gateway/connectors?tenantId=...
- POST /execution-gateway/webhooks/:family

## Dependencies
- Shared logger
- TypeORM connector registry

## Tests
- Per-pack contract tests under `tests/*.contract.spec.ts`
- Shared harness in `tests/connector-contract.harness.ts`

## Changelog
- 2026-02-17 IST: Added execution gateway scaffolding with normalized contracts, five connector packs, webhook/route APIs, and connector contract tests.
