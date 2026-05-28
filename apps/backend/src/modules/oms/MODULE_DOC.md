---
title: OMS Module (Risk Config)
created: 2025-09-19
maintainer: BharatERP
---

## Purpose
Owns risk configuration including buying power rules and margin parameters per tenant/segment/position-type. Accounts & Balances query OMS for multipliers.

## Entities
- BuyingPowerRuleEntity
- OrderEntity
- ExecutionEntity
- OrderAuditEntity
- PositionSnapshotEntity
- UserLeverageOverrideEntity
- BrokerageRuleEntity

## Services
- RiskConfigService: provides `getBuyingPowerMultiplier(segment?, positionType?)`.
- OrderService: place/cancel, executions integration (posts ledgers), event stream
- PositionsService: aggregates positions, valuation, snapshots
- MarginEngineService: computes initial/maintenance margin and brokerage with user overrides.

## Changelog
## APIs
- Orders (JWT + Tenant + Permissions)
  - POST /orders — place (idempotent by `externalRefId`), creates hold using advisory lock per-account
  - POST /orders/modify — modify/replace (price/qty/TIF) via exchange adapter
  - POST /orders/cancel — cancel, releases hold and sends cancel to exchange adapter
  - POST /orders/executions — add execution (idempotent by `externalRefId`)
  - SSE /orders/stream — order/exec events
- OMS Admin
  - CRUD risk rules at `admin/oms/risk/*`
- Margin
  - POST /oms/margin/required — estimate required margin + brokerage

## Flows
- Pre-trade order placement
  1) Tenant + RBAC guards enforced
  2) Advisory lock by `(tenantId, accountId)` via `pg_advisory_xact_lock`
  3) Idempotency: return existing if `externalRefId` reused with identical payload; else conflict
  4) Margin estimation (segment-aware; MIS/CarryForward; F&O/FX/MCX/Equity) with user overrides and brokerage
  5) Create hold for `initialMargin + brokerage` idempotently
  6) Submit to `ExecutionGatewayService`-backed adapter and audit + realtime publish

```mermaid
flowchart TD
  A[POST /orders] --> B[JwtAuth + TenantGuard + Permissions]
  B --> C[Advisory Lock per (tenantId, accountId)]
  C --> D{externalRefId seen?}
  D -- same payload --> R[Return existing order]
  D -- conflict --> E[409 Duplicate order]
  D -- new --> F[MarginEngine.estimate]
  F --> G{canPlace?}
  G -- no --> H[InsufficientMarginError]
  G -- yes --> I[Create Hold (idempotent)]
  I --> J[Persist Order + Audit]
  J --> K[Send to Exchange Adapter]
  K --> L[Realtime publish]
```

## Enterprise Readiness
- Tenant scoping: enforced in controllers and services via `TenantGuard` and `getRequestContext()`
- RBAC: `PermissionsGuard`; permissions: `orders:read`, `orders:write`, `positions:read`, `oms:admin`
- DTO validation: `class-validator` with strict global pipe; Zod tests for shapes
- Logging: Pino `AppLoggerService` with requestId, tenantId correlation
- Error handling: domain `AppError` mapped by `GlobalHttpExceptionFilter`
- Idempotency: orders/executions and all ledger writes via `externalRefId` unique per-tenant
- Concurrency: per-account advisory locks for holds and order placement
- Migrations: TypeORM migrations tracked; no `synchronize` in prod
- Swagger: decorators on DTOs and controllers
- Realtime: SSE for orders and positions; WS gateway with JWT guard

## Admin Capabilities
- Risk rules CRUD (buying power and maintenance rates) — available
- Leverage overrides CRUD — available at `admin/oms/margin/user-overrides`
- Brokerage rules CRUD — available at `admin/oms/margin/brokerage-rules`

## Changelog
- 2025-09-19: Initial creation; rules migrated from Accounts.
- 2025-09-19: Added Orders (REST + SSE), Admin risk CRUD, Positions submodule.
- 2025-09-24: Added TenantGuard to OMS controllers.
- 2025-09-24: Orders idempotency with `externalRefId` + advisory locks; migration added.
- 2025-09-24: MarginEngineService with user leverage overrides and brokerage rules; endpoint `POST /oms/margin/required`.
- 2025-01-09: Added exchange adapter token/provider with NseConnectAdapter; order modify endpoint; cancel routed via adapter
- 2026-02-17: Realtime order publish now routes with request-context userId fallback, and OMS registered under Nx domain boundary project.
- 2026-02-17: OMS exchange adapter now routes via `ExecutionGatewayService` with connector-family selection scaffolding.
- 2026-03-15: Order placement, cancel, and modify branch on account type: DEMO accounts use DemoExchangeAdapter (simulated); LIVE accounts use real execution gateway.


