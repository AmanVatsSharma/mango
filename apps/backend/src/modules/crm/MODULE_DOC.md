# MODULE: CRM (Retention CRM)

## 1. Short

Retention CRM manages outreach campaigns, churn risk scoring, and retention offers for at-risk clients.

## 2. Purpose

Track outreach communications, calculate churn risk scores, and manage discount/cashback retention offers per tenant.

## 3. Files

```
crm/
  entities/
    crm-outreach.entity.ts          — outreach communication record
    crm-retention-offer.entity.ts   — retention offer record
  dtos/
    create-crm-outreach.dto.ts       — outreach create
    create-retention-offer.dto.ts    — retention offer create
  services/
    crm.service.ts                  — CRM operations
  controllers/
    crm.controller.ts              — admin REST endpoints
  crm.module.ts
  index.ts
```

## 4. Flow

```
GET  /admin/crm/clients           → CrmService.listClients
POST /admin/crm/outreach          → CrmService.sendOutreach
GET  /admin/crm/churn-risk        → CrmService.getChurnRiskScores
POST /admin/crm/retention/offers  → CrmService.createRetentionOffer
```

## 5. Dependencies

- SharedModule (AppLoggerService)
- AuthModule (JwtAuthGuard)
- TenancyModule (TenantGuard, CurrentTenant)
- RbacModule (PermissionsGuard, Permissions)

## 6. APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/crm/clients | List CRM client records |
| POST | /admin/crm/outreach | Send outreach communication |
| GET | /admin/crm/churn-risk | Churn risk scores |
| POST | /admin/crm/retention/offers | Create retention offer |

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
| Churn risk computation | Stubbed — returns mock scores |

## Change-log

| Date | Change |
|------|--------|
| 2026-05-16 | Initial scaffold — outreach, churn risk, retention offers |