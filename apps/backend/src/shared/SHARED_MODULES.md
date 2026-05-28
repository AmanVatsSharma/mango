# Shared Infrastructure Modules

**Short:** Cross-cutting providers and patterns that all feature modules depend on without explicit import (Global modules).

**Purpose:** Centralises infrastructure concerns (messaging, reliable event delivery, audit, observability, and tenant bootstrapping) so feature modules remain focused on business logic. All modules here are `@Global()` and are available for injection everywhere after AppModule wiring.

**Change-log:**
- 2026-05-23 IST: Created SHARED_MODULES.md — documented all 5 shared infrastructure modules

---

## MessagingModule

**Purpose:** Pub/sub event bus backed by Redis Pub/Sub. Provides `IMessagePublisher` injectable to any module for emitting domain events. Phase 4 upgrade path swaps `RedisPublisher` for `KafkaPublisher` without touching consumers.

**Files:**
- `messaging/messaging.module.ts`
- `messaging/messaging-contracts.ts` — `MessageEnvelope<T>`, `PublishOptions`, `ConsumerResult`
- `messaging/publisher.interface.ts`
- `messaging/consumer.interface.ts`
- `messaging/redis.publisher.ts` — concrete `RedisPublisher` implementing `IMessagePublisher`
- `messaging/index.ts` — public exports

**Key interfaces:**
- `MessageEnvelope<T>` — `{ correlationId?, tenantId?, timestamp, payload, schemaVersion? }`
- `PublishOptions` — `{ topic?, partitionKey?, delaySeconds? }`
- `IMessagePublisher.publish(topic, envelope, options?)` → `Promise<void>`
- `IMessageConsumer.subscribe(topic, handler)` → `void`

**Who uses it:**
- SettlementModule (settlement events)
- CorporateActionsModule (payment notifications)
- DeveloperPlatformModule (webhook delivery via OutboxModule)

**Env vars:**
- `REDIS_URL` — required for publisher to be active; if absent, publisher is a no-op (dev safety)

---

## OutboxModule

**Purpose:** Transactional outbox pattern — guarantees at-least-once event delivery by writing events to an `outbox` DB table in the same transaction as the business operation, then publishing via a background worker. Solves the "dual write" problem where the DB commit succeeds but the message publish fails.

**Files:**
- `outbox/outbox.module.ts`
- `outbox/outbox.service.ts` — `append()`, `fetchPending()`, `markPublished()`, `markFailed()`
- `outbox/outbox-worker.skeleton.ts` — background worker (skeleton at scaffold stage)
- `outbox/entities/outbox.entity.ts` — `OutboxEntity` (id, tenantId, topic, payload, status, retryCount, lastAttemptAt, lastError, createdAt)
- `outbox/index.ts`

**Entity columns:**
| Column | Type | Notes |
|--------|------|-------|
| status | varchar(32) | PENDING / PUBLISHED / FAILED |
| retryCount | int | incremented on each failure |
| lastAttemptAt | timestamptz | set on each publish attempt |
| lastError | text | set on failure for debugging |

**Indexes:** `idx_outbox_status_created`, `idx_outbox_tenant_status`

**Who uses it:**
- DeveloperPlatformModule (webhook delivery with retry)
- SettlementModule (settlement job events)
- MessagingModule (phase 4 Kafka publish via worker)

**Env vars:**
- None module-specific; inherits `DATABASE_URL` from shared config

---

## AuditModule

**Purpose:** Append-only audit trail for compliance and security. Every state-changing action (create, update, delete, override, impersonation) is recorded with a per-record HMAC-SHA256 signature so regulators or security teams can verify record integrity offline. Supports paginated query with filters.

**Files:**
- `audit/audit.module.ts`
- `audit/audit.service.ts` — `log()`, `query()`, `verifyRecord()`
- `audit/audit-log.entity.ts` — `AuditLogEntity`

**Key methods:**
- `AuditService.log(params)` → `AuditLogEntity` — appends one signed audit record; automatically picks `tenantId` / `actorId` / `requestId` from `getRequestContext()` if not explicitly provided
- `AuditService.query(params)` → `AuditLogEntity[]` — paginated query by tenant, actor, action, resourceType, date range
- `AuditService.verifyRecord(id)` → `boolean` — re-computes HMAC and compares to stored signature

**HMAC signing:**
- Secret: `AUDIT_HMAC_SECRET` env var, falls back to `JWT_ACCESS_SECRET`, falls back to `'dev-audit-secret'`
- Input: `` `${tenantId}|${actorId}|${action}|${resourceId}|${timestamp}` ``

**Who uses it:**
- DealingModule (override audit)
- SupportModule (impersonation audit)
- PartnersModule (payout approval audit)
- DeveloperPlatformModule (key creation/revocation)
- SettlementModule (settlement confirmation)
- ReconciliationModule (break resolution)

**Env vars:**
- `AUDIT_HMAC_SECRET` — HMAC secret for record signing; falls back to `JWT_ACCESS_SECRET` or `dev-audit-secret` if unset

---

## ObservabilityModule

**Purpose:** Metrics (Prometheus) and health check endpoints for platform operations and alerting. Exposes `/metrics` (Prometheus scrape target) and `/health` (load-balancer health probe with DB + Redis checks).

**Files:**
- `observability/observability.module.ts`
- `observability/controllers/health.controller.ts` — `GET /health` (Terminus)
- `observability/controllers/metrics.controller.ts` — `GET /metrics` (PromClient)
- `observability/services/prom-client.service.ts` — `PromClientService`
- `observability/services/redis-health.indicator.ts` — `RedisHealthIndicator`

**Endpoints:**
| Path | Method | Description |
|------|--------|-------------|
| /health | GET | DB ping always; Redis ping only when `REDIS_URL` is set |
| /metrics | GET | Prometheus text format; `Content-Type: text/plain; version=0.0.4` |

**Who uses it:**
- All modules — consumed by platform ops via the public endpoints (not injected as a provider)

**Env vars:**
- `REDIS_URL` — controls whether Redis health check runs on `/health`

---

## PlatformTenantSeeder

**Purpose:** Idempotent bootstrap provider that seeds the `platform` tenant, `platform_owner` role with all `PLATFORM_PERMS`, and one platform owner user on every application boot. Failures are caught and logged — they never crash the app.

**File:**
- `bootstrap/platform-tenant-seeder.ts` — `PlatformTenantSeeder` implements `OnApplicationBootstrap`

**Seed steps:**
1. Ensure `'platform'` tenant exists (code = `'platform'`, displayName = `'Obsidian Platform'`, timezone = `'Asia/Kolkata'`, jurisdictionProfile = `'GLOBAL'`, status = `'ACTIVE'`)
2. Ensure `platform_owner` role and all `PLATFORM_PERMS` exist; grant all permissions to the role
3. If `PLATFORM_OWNER_MOBILE` env var is set: create a user for that mobile and assign `platform_owner` role

**Who uses it:**
- Imported as a provider in `AppModule` (not a `@Global()` module — seed runs once at startup)

**Env vars:**
| Variable | Required | Effect |
|----------|----------|--------|
| `PLATFORM_OWNER_MOBILE` | No | If set, creates and roles the platform owner user |
| `PLATFORM_OWNER_EMAIL` | No | Used as the user's email when `PLATFORM_OWNER_MOBILE` is set |

**Key invariants:**
- All writes are idempotent (checks existence before insert)
- Failure of any step logs a warning and returns — app continues
- Uses tenant code `'platform'` (not UUID) as `tenantId` throughout — consistent with JWT `tid` claim and RBAC guards