# Module: admin

**Short:** Tenant-scoped admin APIs for KPI dashboards and order audit views.

**Purpose:** Provide broker/operator-facing visibility into platform activity without exposing cross-tenant data.

**Files:**
- `admin.module.ts` - Nest module
- `controllers/admin-dashboard.controller.ts` - KPI endpoints
- `controllers/admin-audit.controller.ts` - audit listing endpoints
- `services/admin-dashboard.service.ts` - dashboard and audit data aggregation
- `index.ts` - module re-exports
- `MODULE_DOC.md` - this file

**Flow diagram:** `flowcharts/admin-flow.svg`

**Dependencies:**
- Internal: OMS entities, Accounts entities, Users entities, shared logger
- External: PostgreSQL via TypeORM

**APIs:**
- `GET /admin/dashboard/stats` - tenant KPI snapshot
- `GET /admin/audit/orders` - latest order-audit logs
- `GET /admin/bonuses` - list bonus programs
- `POST /admin/bonuses` - create bonus program
- `PATCH /admin/bonuses/:id` - update bonus program
- `DELETE /admin/bonuses/:id` - deactivate bonus program
- `GET /admin/promotions` - list promotion campaigns
- `POST /admin/promotions` - create promotion campaign
- `PATCH /admin/promotions/:id` - update promotion campaign
- `GET /admin/deployment/status` - current deployment status and health
- `POST /admin/deployment/deploy` - trigger a new deployment (returns 202, async)
- `GET /admin/deployment/history` - deployment history (limit query param)
- `GET /admin/deployment/logs` - deploy logs (by deployId or latest)

**GraphQL (admin.resolver.ts):**
- Query adminStats(from?, to?) — KPI snapshot (oms:admin)
- Query adminRevenue(period?) — revenue series by period bucket (oms:admin)
- Query adminSystemStatus — service health list (oms:admin)
- Query adminOrderAudits(limit?) — latest order audits (oms:admin)
- Query adminAudits(actor?, module?, action?, from?, to?, limit?, offset?) — paginated audit log (oms:admin)

**Env vars:**
- none specific (inherits global auth/tenant config)

**Tests:** controller/service coverage should validate tenant scoping and limit bounds.

**Change-log:**
- 2026-05-19 IST: Added AdminDeploymentController + AdminDeploymentService.
  Endpoints: GET /admin/deployment/status, POST /admin/deployment/deploy,
  GET /admin/deployment/history, GET /admin/deployment/logs.
  All protected by BrokerAdminGuard. Deploy trigger is non-blocking (async).
- 2026-05-19: Added admin.resolver.ts — GraphQL Query surface mirroring REST dashboard/audit endpoints; admin.index.ts barrel exports AdminResolver. Refactored listOrderAudits (now listOrderAuditsByTenant) and listAllAudits to accept raw string query params, moving parsing into the service layer.
- 2025-01-09 IST: Initial admin module with dashboard stats and order-audit APIs.
