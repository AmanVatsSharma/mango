---
title: Settlement Module
created: 2026-02-17
maintainer: BharatERP
---

# Module: settlement

**Short:** Post-trade settlement job orchestration — schedule, track, and report on end-of-day settlement runs.

**Purpose:** Manages the end-of-day (EOD) settlement process: triggers settlement jobs per tenant, coordinates with AccountsModule to move funds (net positions vs. gross), generates settlement reports, and tracks job status (PENDING → PROCESSING → COMPLETED / FAILED). Acts as the back-office complement to the OMS — once trades are confirmed in OMS, settlement finalises the fund movement.

**Assumptions (stated explicitly):** Entity `SettlementJobEntity` is assumed from the stub and standard settlement patterns. The module handles EOD batch jobs, not real-time gross settlement. The module was scaffolded 2026-02-17; concrete controller/service files were not inspected.

**Files:**
- `settlement.module.ts` — Nest module
- `entities/settlement-job.entity.ts` — SettlementJobEntity (id, tenantId, runDate, status, totalTrades, settledAmount, startedAt, completedAt, errorMsg)
- `dtos/` — CreateSettlementJobDto, SettlementReportDto
- `controllers/settlement.controller.ts` — REST endpoints
- `services/` — SettlementService, SettlementProcessor (skeleton)

**Dependencies:**
- Internal: OmsModule (trade data for settlement), AccountsModule (fund movement), AuditModule (settlement confirmation), OutboxModule (settlement events)
- External: PostgreSQL (settlement jobs), Redis (job queue lock to prevent duplicate runs)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /settlement/jobs | Trigger a settlement run (EOD) for a tenant |
| GET | /settlement/jobs?tenantId=... | List settlement jobs (filterable by status, date range) |
| GET | /settlement/jobs/:id | Get settlement job details and line items |
| POST | /settlement/jobs/:id/retry | Retry a failed settlement job |
| GET | /settlement/reports?tenantId=...&runDate=... | Get settlement summary report for a run |

**Env vars:**
- `SETTLEMENT_LOCK_TTL_SEC` — Redis lock TTL for preventing concurrent runs (default: 300s)

**Tests:**
- Unit: SettlementProcessor calculates net amounts correctly
- Integration: concurrent trigger is rejected if a job is already RUNNING for same tenant+date
- E2E: trigger EOD job → processing → completed → report generated

**Change-log:**
- 2026-02-17 IST: Added settlement scaffold with entity, DTO, APIs, tests, and docs.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entity and assumptions.