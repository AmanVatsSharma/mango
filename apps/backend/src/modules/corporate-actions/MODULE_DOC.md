---
title: Corporate Actions Module
created: 2026-02-17
maintainer: BharatERP
---

# Module: corporate-actions

**Short:** Corporate action ingestion and position adjustment — dividends, stock splits, mergers, and other corporate events.

**Purpose:** Ingests corporate action announcements (from external data providers or manual entry), tracks the event lifecycle (ANNOUNCED → EX_DATE → RECORD_DATE → PAYMENT_DATE), and applies position adjustments to affected accounts at ex-date. Supports dividend payments, stock splits, bonus issues, and rights issues. Adjustment records are audit-logged and linked to the AuditModule trail.

**Assumptions (stated explicitly):** Entity `CorporateActionEntity` is assumed from standard corporate actions module patterns. Adjustment application is assumed to happen atomically at ex-date, modifying account positions via AccountsModule. The module was scaffolded 2026-02-17; concrete controller/service files were not inspected.

**Files:**
- `corporate-actions.module.ts` — Nest module
- `entities/corporate-action.entity.ts` — CorporateActionEntity (id, tenantId, instrumentId, type, announcementDate, exDate, recordDate, paymentDate, status, adjustmentDetailsJson, createdAt)
- `entities/corporate-action-adjustment.entity.ts` — CorporateActionAdjustmentEntity (id, corporateActionId, accountId, adjustmentType, amount, status)
- `dtos/` — CreateCorporateActionDto, ApplyAdjustmentDto
- `controllers/corporate-actions.controller.ts` — REST endpoints
- `services/` — CorporateActionService, AdjustmentProcessor (skeleton)

**Dependencies:**
- Internal: AccountsModule (position adjustment), MarketModule (instrument eligibility), AuditModule (adjustment audit), MessagingModule (notification on payment)
- External: PostgreSQL (corporate actions + adjustments)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /corporate-actions/events | Create / ingest a corporate action event |
| GET | /corporate-actions/events?tenantId=... | List corporate actions (filterable by instrument, type, status) |
| GET | /corporate-actions/events/:id | Get event detail with adjustments |
| PATCH | /corporate-actions/events/:id | Update event status (e.g., mark as EXECUTED) |
| POST | /corporate-actions/events/:id/adjustments | Trigger position adjustments for eligible accounts |
| GET | /corporate-actions/events/:id/adjustments | List adjustments applied for an event |
| GET | /corporate-actions/reports?tenantId=...&from=...&to=... | Corporate actions summary report |

**Env vars:**
- None module-specific; uses shared DB

**Tests:**
- Unit: AdjustmentProcessor correctly calculates split multiplier on old positions
- Integration: applying adjustment to closed account is rejected
- E2E: corporate action announced → ex-date reached → adjustments applied → payment confirmed

**Change-log:**
- 2026-02-17 IST: Added corporate actions scaffold with event entity, DTO, APIs, tests, and docs.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entities and assumptions.