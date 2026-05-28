# MODULE: LP Routing (Liquidity Provider Routing Console)

## 1. Short

LP Routing Console allows brokers to manage liquidity provider endpoints and test quote responses.

## 2. Purpose

CRUD for LP provider configurations (name, type, API endpoint, priority). Includes a quote-test endpoint for validating LP connectivity.

## 3. Files

```
lp-routing/
  entities/
    lp-provider.entity.ts       — LP provider record
  dtos/
    create-lp-provider.dto.ts   — create provider
    update-lp-provider.dto.ts   — update provider
    test-lp-quote.dto.ts        — test quote payload
  services/
    lp-routing.service.ts      — provider management
  controllers/
    lp-routing.controller.ts   — admin REST endpoints
  lp-routing.module.ts
  index.ts
```

## 4. Flow

```
GET  /admin/lp/routing                → LpRoutingService.listProviders
POST /admin/lp/routing/providers      → LpRoutingService.createProvider
PATCH /admin/lp/routing/providers/:id → LpRoutingService.updateProvider
POST /admin/lp/routing/test-quote     → LpRoutingService.testQuote
```

## 5. Dependencies

- SharedModule (AppLoggerService)
- AuthModule (JwtAuthGuard)
- TenancyModule (TenantGuard, CurrentTenant)
- RbacModule (PermissionsGuard, Permissions)
- **ExecutionGateway** — LpRouting stores provider configurations consumed by ExecutionGateway at order routing time; the LP routing priority determines which provider receives the order flow

Dependency graph:
```
LpRouting ──→ ExecutionGateway (provider configs and priority rankings drive ExecutionGateway's routing decisions at trade execution time)
```

## 6. APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/lp/routing | List LP providers |
| POST | /admin/lp/routing/providers | Add LP provider |
| PATCH | /admin/lp/routing/providers/:id | Update provider |
| POST | /admin/lp/routing/test-quote | Test LP quote |

## 7. Public route list

None — all routes require authentication.

## 8. Idempotency contract

None

## 9. Domain events

None (stubbed)

## 10. Env vars

None specific to LP Routing; ExecutionGateway env vars govern the actual quote fetching and order routing downstream.

## 11. Tests

Unit tests co-located `*.spec.ts`

## 12. Failure modes

| Scenario | Behavior |
|----------|----------|
| Provider not found on update | throws AppError(RESOURCE_NOT_FOUND) |

## Change-log

| Date | Change |
|------|--------|
| 2026-05-16 | Initial scaffold — provider CRUD, quote testing |
| 2026-05-23 | Expanded module doc — added dependency graph showing LpRouting → ExecutionGateway relationship. |
