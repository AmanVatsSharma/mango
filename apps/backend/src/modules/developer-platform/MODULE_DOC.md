---
title: Developer Platform Module
created: 2026-02-19
maintainer: BharatERP
---

# Module: developer-platform

**Short:** External developer onboarding, API key lifecycle, and webhook management for third-party integrations.

**Purpose:** Self-service portal for external developers to register apps, generate scoped API keys, manage webhook subscriptions, and monitor usage. API keys are tied to specific permission scopes and can be rotated or revoked. Webhook delivery includes retry logic backed by the OutboxModule.

**Assumptions (stated explicitly):** Entities `ApiKeyEntity` and `DeveloperAppEntity` are assumed from standard API gateway / developer portal patterns. Webhook registration is a placeholder at scaffold stage. The module was scaffolded 2026-02-19; concrete controller/service files were not inspected.

**Files:**
- `developer-platform.module.ts` — Nest module
- `entities/api-key.entity.ts` — ApiKeyEntity (id, tenantId, appId, keyHash, prefix, scopes, status, lastUsedAt, expiresAt)
- `entities/developer-app.entity.ts` — DeveloperAppEntity (id, developerId, name, description, status)
- `dtos/` — CreateAppDto, CreateApiKeyDto, RegisterWebhookDto
- `controllers/developer-platform.controller.ts` — REST endpoints
- `services/` — DeveloperAppService, ApiKeyService, WebhookService

**Dependencies:**
- Internal: OutboxModule (webhook delivery retry), AuditModule (key creation/revocation logs), MessagingModule (event notifications)
- External: PostgreSQL (apps + keys), Redis (rate limit counters per key)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /developer-platform/apps | Register a new developer app |
| GET | /developer-platform/apps?tenantId=... | List developer apps |
| GET | /developer-platform/apps/:id | Get app details |
| POST | /developer-platform/api-keys | Generate a new API key for an app |
| GET | /developer-platform/api-keys?tenantId=... | List API keys (masked — only prefix shown) |
| GET | /developer-platform/api-keys/:id/status | Check key status (ACTIVE / REVOKED / EXPIRED) |
| POST | /developer-platform/api-keys/:id/rotate | Rotate an existing key |
| DELETE | /developer-platform/api-keys/:id | Revoke an API key |
| POST | /developer-platform/webhooks | Register a webhook endpoint |
| GET | /developer-platform/webhooks?tenantId=... | List registered webhooks |
| DELETE | /developer-platform/webhooks/:id | Unregister a webhook |

**Env vars:**
- `WEBHOOK_SECRET` — HMAC secret for signing outbound webhook payloads

**Tests:**
- Unit: ApiKeyService hash round-trip (plain → hash → compare)
- Integration: rotate endpoint revokes old key and issues new one in same transaction
- E2E: app registration → key generation → webhook registration → key revocation

**Change-log:**
- 2026-02-19 IST: Added developer-platform module scaffold with api-key entity, DTO, APIs, tests, and docs.
- 2026-02-19 IST: Added webhook registration placeholder and secured controller with JWT/Tenant/RBAC guards.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entities and assumptions.