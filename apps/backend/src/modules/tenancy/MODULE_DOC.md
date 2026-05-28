---
title: Tenancy Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Provides tenant lifecycle, legal-entity management, brand configuration, and
custom domain registration for global broker SaaS operations.

## Entities
- TenantEntity
- LegalEntityEntity
- TenantBrandConfigEntity
- TenantDomainEntity

## APIs
- POST /tenancy/tenants — create tenant
- GET /tenancy/tenants — list tenants
- POST /tenancy/legal-entities — create legal entity
- GET /tenancy/legal-entities?tenantId=... — list legal entities
- GET /tenancy/brand-config?slug=... — get brand config (public)
- POST /tenancy/tenants/:tenantId/brand-config — upsert brand config
- GET /tenancy/admin/brand-config — get own tenant brand config (admin)
- GET /tenancy/domains — list custom domains (broker admin)
- POST /tenancy/domains — register a custom domain (broker admin)
- DELETE /tenancy/domains/:id — remove a domain (broker admin)
- POST /tenancy/domains/:id/set-primary — promote domain to primary (broker admin)
- GET /tenancy/domains/verify/:domain — check DNS verification status
- GET /tenancy/domains/ssl/:domain — check SSL status

## Dependencies
- SharedModule logger
- RbacModule (for guard resolution)
- TypeORM repositories

## Flow
1. Platform owner creates tenant and jurisdiction profile.
2. Broker legal entities are attached to tenant.
3. Broker admin registers custom domains and promotes a primary.
4. DNS/SSL status is checked per domain for deployment readiness.
5. Downstream hierarchy/compliance modules consume tenant identifiers.

## Env
- TENANCY_ENABLED=true

## Tests
- Unit test scaffold in `tests/tenancy.service.spec.ts`.

## Changelog
- 2026-05-19 IST: Added TenantDomainEntity, DomainsController, and domain
  management methods to TenancyService (listDomains, addDomain, removeDomain,
  setPrimaryDomain, verifyDomainDns, getDomainSslStatus). All domain endpoints
  protected by BrokerAdminGuard.
- 2026-02-17 IST: Added tenancy scaffold with entities, DTO validation, controller, service, exports, and module documentation.
- 2026-05-09 IST: Added TenancyService.findByCode(code) helper. Added PlatformOwnerGuard on write endpoints (POST tenants, GET tenants, POST legal-entities, GET legal-entities, POST brand-config). GET brand-config remains public.
