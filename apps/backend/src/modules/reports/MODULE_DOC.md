# MODULE: Reports (Report Builder)

## 1. Short

Report Builder enables parameterized report definitions that can be executed and downloaded as files.

## 2. Purpose

Create and manage report templates with configurable columns and filters. Execute reports and serve downloadable results.

## 3. Files

```
reports/
  entities/
    report-definition.entity.ts        — report definition
  dtos/
    create-report-definition.dto.ts   — create definition
  services/
    reports.service.ts                — report management
  controllers/
    reports.controller.ts            — admin REST endpoints
  reports.module.ts
  index.ts
```

## 4. Flow

```
GET    /admin/reports/builder         → ReportsService.listReports
POST   /admin/reports                 → ReportsService.createReport
GET    /admin/reports/:id/download    → ReportsService.executeReport → JSON download
```

## 5. Dependencies

- SharedModule (AppLoggerService)
- AuthModule (JwtAuthGuard)
- TenancyModule (TenantGuard, CurrentTenant)
- RbacModule (PermissionsGuard, Permissions)

## 6. APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/reports/builder | List report definitions |
| POST | /admin/reports | Create report definition |
| GET | /admin/reports/:id/download | Execute and download |

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
| Report not found | throws AppError(RESOURCE_NOT_FOUND) |

## Change-log

| Date | Change |
|------|--------|
| 2026-05-16 | Initial scaffold — report definition CRUD, execution stub, JSON download |