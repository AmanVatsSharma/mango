---
title: Limits and Controls Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Operational risk guardrails for broker-admin: pre-trade limit enforcement (MAX_OPEN_ORDERS, MAX_ORDER_NOTIONAL, INSTRUMENT_BLACKLIST) plus admin-managed exposure limits per instrument.

## Public routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /admin/limits/exposure | JwtAuth + TenantGuard + oms:admin | List all exposure limits for tenant |
| POST | /admin/limits/exposure | JwtAuth + TenantGuard + oms:admin | Create or upsert exposure limit |
| PATCH | /admin/limits/exposure/:id | JwtAuth + TenantGuard + oms:admin | Partial update of exposure limit |
| POST | /limits-and-controls/controls | — | Create limit control |
| GET | /limits-and-controls/controls | — | List limit controls |
| POST | /limits-and-controls/exceptions | — | Create exception |
| GET | /limits-and-controls/exceptions | — | List exceptions |

## Entities
- `LimitControlEntity` — MAX_OPEN_ORDERS, MAX_ORDER_NOTIONAL, INSTRUMENT_BLACKLIST
- `LimitExceptionEntity` — approved exceptions to limit controls
- `ExposureLimitEntity` — per-instrument net-exposure caps with alertThreshold and hardLimit

## Domain Events
- None (no cross-module events; pre-trade checks are synchronous)

## Idempotency
- Exposure limit upsert keyed on tenantId + instrumentId

## Changelog
- 2026-05-16: Added ExposureLimitEntity, AdminLimitsController (admin/limits/exposure CRUD), AdminLimitsService, exposure-limit.dto.ts. AdminLimitsService exported so OmsModule can call checkExposureLimit().
- 2026-02-17 IST: Added limits-and-controls scaffold with controls/exceptions entities, DTOs, APIs, tests, and docs.
