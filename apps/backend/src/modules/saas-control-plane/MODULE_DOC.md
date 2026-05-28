---
title: SaaS Control Plane Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Scaffolds platform-owner governance functions including tenant provisioning, entitlements,
billing placeholders, and support impersonation audit controls.

## APIs
- POST /saas-control-plane/provisioning
- GET /saas-control-plane/provisioning?tenantId=...
- POST /saas-control-plane/entitlements
- GET /saas-control-plane/entitlements?tenantId=...
- POST /saas-control-plane/billing/invoices
- GET /saas-control-plane/billing/invoices?tenantId=...
- POST /saas-control-plane/audit/impersonations
- GET /saas-control-plane/audit/impersonations?tenantId=...

### New endpoints (2026-05-09)
- POST /saas/onboard-broker        [PlatformOwnerGuard] — sequenced+idempotent 7-step broker onboarding
- GET /saas/brokers                [PlatformOwnerGuard] — list all provisioned broker tenants
- GET /saas/brokers/:tenantCode    [PlatformOwnerGuard] — single broker by tenant code
- POST /saas/brokers/:tenantCode/suspend [PlatformOwnerGuard] — suspend broker tenant

## Changelog
- 2026-02-17 IST: Added SaaS control-plane scaffolding with provisioning, entitlement, billing, and support-audit APIs plus tests/docs.
- 2026-05-09 IST: Added BrokerOnboardingService + BrokerOnboardingController. POST /saas/onboard-broker performs sequenced+idempotent onboarding (tenant → provision → broker → admin user → role assign → SMS → outbox event). All /saas/* guarded by PlatformOwnerGuard. Fixed welcome-email recipient bug. Added OnboardBrokerDto with reserved-code validation.
