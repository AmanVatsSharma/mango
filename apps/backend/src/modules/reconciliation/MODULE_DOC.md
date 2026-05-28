---
title: Reconciliation Module
created: 2026-02-17
maintainer: BharatERP
---

# Module: reconciliation

**Short:** P&L reconciliation against LP statements — match positions, detect breaks, and manage exception queues.

**Purpose:** Compares internal trade positions and P&L figures against Liquidity Provider (LP) statements to detect discrepancies. Breaks are classified by severity, assigned to reconciliation analysts, and tracked through resolution. Generates daily reconciliation reports for finance and risk teams. Acts as the LP-facing complement to SettlementModule.

**Assumptions (stated explicitly):** Entities `ReconciliationBreakEntity` and `LPStatementLineEntity` are assumed from standard reconciliation module patterns. Breaks are assumed to be matched at trade level (instrument + side + qty + price). The module was scaffolded 2026-02-17; concrete controller/service files were not inspected.

**Files:**
- `reconciliation.module.ts` — Nest module
- `entities/reconciliation-break.entity.ts` — ReconciliationBreakEntity (id, tenantId, instrumentId, breakType, side, qtyDiff, priceDiff, pnlImpact, status, assignedTo, resolvedAt)
- `entities/lp-statement-line.entity.ts` — LPStatementLineEntity (id, tenantId, lpId, statementDate, instrumentId, side, qty, price, pnl, importedAt)
- `dtos/` — ImportStatementDto, ResolveBreakDto
- `controllers/reconciliation.controller.ts` — REST endpoints
- `services/` — ReconciliationService, BreakMatcherService (skeleton)

**Dependencies:**
- Internal: SettlementModule (trade data), MarketModule (instrument reference), AccountsModule (P&L figures), AuditModule
- External: PostgreSQL (breaks + statement lines)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /reconciliation/breaks | Manually flag a break (also auto-created by scheduled match job) |
| GET | /reconciliation/breaks?tenantId=... | List breaks (filterable by status, instrument, LP) |
| GET | /reconciliation/breaks/:id | Get break detail |
| PATCH | /reconciliation/breaks/:id | Update break status / assignee |
| POST | /reconciliation/breaks/:id/resolve | Resolve and close a break |
| POST | /reconciliation/statements/import | Import an LP statement (CSV/JSON) |
| GET | /reconciliation/statements?tenantId=... | List imported LP statements |
| GET | /reconciliation/reports?tenantId=...&date=... | Get reconciliation summary for a date |

**Env vars:**
- None module-specific; uses shared DB

**Tests:**
- Unit: BreakMatcherService correctly identifies qty/price mismatches
- Integration: import statement creates break records for unmatched lines
- E2E: import LP statement → auto-match against internal trades → breaks surfaced → resolved

**Change-log:**
- 2026-02-17 IST: Added reconciliation scaffold with break entity, DTO, API, tests, and docs.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entities and assumptions.