# MODULE: Promotions

## 1. Short

Promotions module manages bonus, cashback, and discount campaigns per tenant with budget tracking.

## 2. Purpose

CRUD for promotional campaigns with start/end dates, budget caps, and announcement triggers.

## 3. Files

```
promotions/
  entities/
    promotion.entity.ts     — promotion record
  dtos/
    create-promotion.dto.ts — create promotion
    update-promotion.dto.ts — update promotion
  services/
    promotions.service.ts  — promotion management
  controllers/
    promotions.controller.ts — admin REST endpoints
  promotions.module.ts
  index.ts
```

## 4. Flow

```
GET    /admin/promotions             → PromotionsService.listPromotions
POST   /admin/promotions             → PromotionsService.createPromotion
PATCH  /admin/promotions/:id         → PromotionsService.updatePromotion
POST   /admin/promotions/:id/announce → PromotionsService.announcePromotion
```

## 5. Dependencies

- SharedModule (AppLoggerService)
- AuthModule (JwtAuthGuard)
- TenancyModule (TenantGuard, CurrentTenant)
- RbacModule (PermissionsGuard, Permissions)

## 6. APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/promotions | List promotions |
| POST | /admin/promotions | Create promotion |
| PATCH | /admin/promotions/:id | Update promotion |
| POST | /admin/promotions/:id/announce | Trigger announcement |

## 7. Public route list

None — all routes require authentication.

## 8. Idempotency contract

None

## 9. Domain events

None (stubbed)

## 10. Env vars

None

## 11. Tests

Unit tests co-located `*.spec.ts`

## 12. Failure modes

| Scenario | Behavior |
|----------|----------|
| endDate before startDate | throws AppError(VALIDATION_ERROR) |
| Promotion not found | throws AppError(RESOURCE_NOT_FOUND) |

## Change-log

| Date | Change |
|------|--------|
| 2026-05-16 | Initial scaffold — promotion CRUD, budget tracking, announcement |