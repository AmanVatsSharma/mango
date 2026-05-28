# MODULE: PAMM (Percentage Allocation Management Module)

## 1. Short

PAMM enables master-trader strategies where a manager runs a pooled account and allocations are distributed proportionally to slave investors.

## 2. Purpose

Manage PAMM master strategies and slave account allocations. Tracks performance fees and minimum allocation thresholds per strategy.

## 3. Files

```
pamm/
  entities/
    pamm-master.entity.ts      — PAMM strategy master
    pamm-slave.entity.ts       — slave allocation record
  dtos/
    create-pamm-master.dto.ts  — master creation
    create-pamm-allocation.dto.ts — allocation create/update
  services/
    pamm.service.ts           — CRUD operations
  controllers/
    pamm.controller.ts        — admin REST endpoints
  pamm.module.ts
  index.ts
```

## 4. Flow

```
POST /admin/pamm/masters          → PammService.createMaster
GET  /admin/pamm/masters          → PammService.listMasters
POST /admin/pamm/allocations     → PammService.createOrUpdateAllocation
GET  /admin/pamm/slaves           → PammService.listSlaves
```

## 5. Dependencies

- SharedModule (AppLoggerService)
- AuthModule (JwtAuthGuard)
- TenancyModule (TenantGuard, CurrentTenant)
- RbacModule (PermissionsGuard, Permissions)
- **OMS** — PAMM allocates orders through OMS order routing; allocations drive which master/slave accounts receive filled positions
- **Accounts** — PAMM reads account balances to compute proportional allocation amounts; writes allocation records that feed into account equity tracking

Dependency graph:
```
OMS ──→ PAMM (OMS publishes fill events consumed by PAMM allocation accounting)
Accounts ──→ PAMM (PAMM reads account equity, writes allocation records)
PAMM ──→ OMS (allocation triggers order routing to master/slave accounts)
PAMM ──→ Accounts (allocation changes affect account equity distribution)
```

## 6. APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/pamm/masters | List PAMM masters |
| POST | /admin/pamm/masters | Create PAMM master |
| GET | /admin/pamm/slaves | List slave allocations |
| POST | /admin/pamm/allocations | Create/update allocation |

## 7. Public route list

None — all routes require authentication.

## 8. Idempotency contract

- `allocations` endpoint is idempotent via `(masterId, userId)` unique constraint

## 9. Domain events

None (stubbed — real implementation publishes allocation changes via outbox)

## 10. Env vars

None specific to PAMM; OMS and Accounts env vars govern the downstream routing and equity tracking.

## 11. Tests

Unit tests co-located `*.spec.ts`

## 12. Failure modes

| Scenario | Behavior |
|----------|----------|
| Master not found | returns empty list (GET), 400 on create |
| Allocation > 100% | DTO validator rejects |

## Change-log

| Date | Change |
|------|--------|
| 2026-05-16 | Initial scaffold — master/slave entities, CRUD, guards |
| 2026-05-23 | Expanded module doc — added dependency graph showing PAMM → OMS and PAMM → Accounts relationships. |
