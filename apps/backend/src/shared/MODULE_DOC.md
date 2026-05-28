# Module: shared

**Short:** Global providers and utilities (logger, AWS SNS, Redis, request context).

**Purpose:** Offer cross-cutting infrastructure services to all modules with consistent logging and request correlation.

**Files:**
- shared.module.ts — Nest global module
- logger.ts — Pino-based `AppLoggerService`
- request-context.ts — per-request context store (requestId, tenantId)
- request-id.middleware.ts — attaches requestId to requests
- aws/sns.service.ts — SNS wrapper provider
- redis/redis.service.ts — Redis provider
- MODULE_DOC.md — this file

**Flow diagram:** `flowcharts/shared-flow.svg`

**Dependencies:**
- External: AWS SNS, Redis
- Internal: none (global module is imported by `AppModule`)

**APIs:**
- Not applicable; exports Nest providers to be injected by other modules

**Env vars:**
- LOG_LEVEL=debug|info
- NODE_ENV=development|production
- AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
- REDIS_URL

**Tests:**
- Ensure `AppLoggerService` formats log with requestId and tenantId
- Mock SNS/Redis for unit tests

**Change-log:**
- 2025-09-19 IST: Initial documentation added and synced with code
 - 2025-09-19 IST: Clarified env vars and usage with Market module integration
- 2026-02-17 IST: Fixed request-context middleware flow so `next()` always executes; added shared `index.ts` exports and Nx infra boundary project.
- 2026-02-19 IST: Lane C scaffolds: messaging (contracts, publisher/consumer interfaces, module), outbox (entity, service, worker skeleton), resilience (retry, circuit-breaker wrappers), cache (tenant-aware key builder, ICacheService contract).


