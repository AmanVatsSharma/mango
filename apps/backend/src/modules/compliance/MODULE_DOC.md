---
title: Compliance Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Jurisdiction-aware compliance controls for KYC, AML, sanctions, suitability, audit retention, and surveillance alert management.

## Entities
- `CompliancePolicyEntity` — per-tenant jurisdiction policy (kycTier, amlRiskLevel, sanctionsProvider, auditRetentionDays)
- `SurveillanceAlertEntity` — TRIGGERED → ACKNOWLEDGED → DISMISSED lifecycle; soft-delete on dismiss

## Public routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /admin/compliance/config | JwtAuth + TenantGuard + admin | List policies (existing AdminComplianceController) |
| PUT | /admin/compliance/config/:id | JwtAuth + TenantGuard + admin | Partial update by ID |
| GET | /admin/compliance/policies | JwtAuth + TenantGuard + admin | List compliance policies (upsert by jurisdictionCode) |
| POST | /admin/compliance/policies | JwtAuth + TenantGuard + admin | Create or upsert compliance policy |
| GET | /admin/surveillance/alerts | JwtAuth + TenantGuard + admin | List surveillance alerts |
| PATCH | /admin/surveillance/alerts/:id/dismiss | JwtAuth + TenantGuard + admin | Soft-dismiss alert with optional reason |
| PATCH | /admin/surveillance/alerts/:id/acknowledge | JwtAuth + TenantGuard + admin | Acknowledge alert |
| GET | /admin/aml/cases | JwtAuth + TenantGuard + oms:admin | List AML cases with filters |
| GET | /admin/aml/cases/:id | JwtAuth + TenantGuard + oms:admin | Get single AML case |
| POST | /admin/aml/cases/:id/flag | JwtAuth + TenantGuard + oms:admin | Flag case as suspicious |
| POST | /admin/aml/cases/:id/clear | JwtAuth + TenantGuard + oms:admin | Clear a case |
| POST | /compliance/policies | — | Create/update tenant jurisdiction policy |
| GET | /compliance/policies | — | List tenant policies |

## Idempotency
- Compliance policy upsert keyed on tenantId + jurisdictionCode
- Surveillance alerts are immutable rows (status transitions only)

## Changelog
- 2026-05-18: Added AdminAmlController with /admin/aml/cases CRUD endpoints (list, get, flag, clear). Mock in-memory store; replace with AmlService when AML scoring engine is wired.
- 2026-05-16: Added SurveillanceAlertEntity, SurveillanceService, AdminSurveillanceController (admin/surveillance endpoints), AdminCompliancePoliciesController (admin/compliance/policies CRUD). SurveillanceAlertEntity exported for RiskPolicyModule injection.
- 2026-02-17 IST: Added compliance policy scaffolding with DTO validation, controller/service, tests, exports, and module documentation.
