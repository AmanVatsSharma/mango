---
title: Dealing Module
created: 2026-02-19
maintainer: BharatERP
---

# Module: dealing

**Short:** Dealer terminal for capturing quotes, manual order entry, and trade override workflows.

**Purpose:** Powers the front-office dealing desk — enables dealers to request live quotes from LPs, manually enter order blocks, track deal status, and apply secured overrides on flagged trades. Supports the full deal lifecycle from quote request through execution confirmation and exception handling.

**Assumptions (stated explicitly):** Based on standard dealer terminal patterns and the stub's override/audit endpoints. Entities `DealEntity` and `DealingQuoteEntity` are assumed from the module name and standard fintech taxonomy. The module was scaffolded 2026-02-19; concrete controller/service files were not inspected.

**Files:**
- `dealing.module.ts` — Nest module
- `entities/deal.entity.ts` — DealEntity (id, tenantId, instrumentId, side, qty, price, status, lpId, dealerId, createdAt)
- `entities/dealing-quote.entity.ts` — DealingQuoteEntity (id, tenantId, instrumentId, bidPrice, askPrice, validUntil, lpId)
- `dtos/` — CreateDealDto, QuoteRequestDto, OverrideDealDto
- `controllers/dealing.controller.ts` — REST endpoints
- `services/` — DealingService, QuoteService

**Dependencies:**
- Internal: OmsModule, MarketModule (instrument lookup), AuditModule (override logging)
- External: PostgreSQL (deals + quotes), Redis (quote cache)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /dealing/deals | Create a new manual deal (dealer order entry) |
| GET | /dealing/deals?tenantId=... | List all deals for a tenant |
| GET | /dealing/deals/:id/status | Get deal status (OPEN / FILLED / CANCELLED / OVERRIDDEN) |
| POST | /dealing/deals/:id/override | Dealer override on a flagged/exception deal (audit-logged, secured) |
| POST | /dealing/quotes | Request a quote from an LP (create DealingQuoteEntity) |
| GET | /dealing/quotes?instrumentId=... | Get current quote for an instrument |

**Env vars:**
- None module-specific; uses shared DB and Redis

**Tests:**
- Unit: DealService.create() with valid instrument
- Integration: override endpoint rejects unsigned requests (JWT + RBAC guard)
- E2E: deal lifecycle: quote → manual entry → filled

**Change-log:**
- 2026-02-19 IST: Added dealing module scaffold with deal entity, DTO, APIs, tests, and docs.
- 2026-02-19 IST: Added secured manual-override audit hook endpoint for dealer intervention workflow.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entities and assumptions.