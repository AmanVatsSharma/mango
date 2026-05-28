# Module: notifications

Short: Notification preference and dispatch module for transactional platform alerts.

Purpose: Persist notification events, enforce user channel preferences, and provide integration hooks for email/SMS/push delivery.

Files:
- `notifications.module.ts` - Nest module
- `controllers/notifications.controller.ts` - list notification history
- `controllers/notification-preferences.controller.ts` - update/list preferences
- `services/notification.service.ts` - dispatch orchestration and persistence
- `services/notification-template.service.ts` - template rendering helper
- `entities/` - notification and preference entities
- `dtos/` - payload validation DTOs
- `index.ts` - module re-exports
- `MODULE_DOC.md` - this file

Flow diagram: `flowcharts/notifications-flow.svg`

Dependencies:
- Internal: shared logger, request context, RBAC guards, observability module
- External: PostgreSQL via TypeORM (channel delivery providers to be wired)

Entities:
- **NotificationEntity** — persisted notification record per user: id, tenantId, userId, category, channel (email|SMS|push), subject, body, metadata (JSONB), readAt, createdAt
- **NotificationPreferenceEntity** — per-user per-category channel opt-in: id, tenantId, userId, category, emailEnabled, smsEnabled, pushEnabled, createdAt, updatedAt

APIs:
- `GET /notifications` — list current user notifications (tenant-scoped, paginated)
- `PATCH /notifications/preferences` — upsert channel preference per category

Channels:
- Email — SES integration stubbed, enabled via provider key env vars
- SMS — SNS integration stubbed, enabled via provider key env vars
- Push — FCM integration stubbed, enabled via provider key env vars

Template rendering: NotificationTemplateService resolves a template key (e.g. `order.filled`) and renders subject/body with variable interpolation before dispatch.

Preference enforcement: NotificationService checks NotificationPreferenceEntity before sending; if a channel is disabled for a category it is skipped silently.

Env vars:
- none specific currently; provider keys (AWS_SES_*, AWS_SNS_*, FIREBASE_*) to be added when delivery providers are wired

Tests: verify preference filtering and tenant-safe read/write behavior.

Change-log:
- 2025-01-09 IST: Initial module with entities, APIs, and template-based dispatch stubs.
- 2026-02-17 IST: Added module doc, public re-exports, and Nx domain project boundary (`backend-notifications`).
- 2026-05-23: Expanded module doc — added ENTITIES section documenting NotificationEntity and NotificationPreferenceEntity, clarified channel dispatch and preference enforcement.
