---
title: Risk Policy Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Jurisdiction risk rules, pre-trade enforcement, and aggregated risk dashboard for broker-admin.

## Entities
- `RiskPolicyEntity` — jurisdiction-level risk constraints (maxLeverage, maxOrderNotional, restrictedProducts, sanctionsCheckRequired)
- `TenantRiskPolicyEntity` — risk policy assignments to scopes (TENANT/BROKER/DESK/ACCOUNT)

## Public routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /admin/risk/policies | JwtAuth + TenantGuard + oms:admin | List all risk policies (paginated) |
| GET | /admin/risk/exposure | JwtAuth + TenantGuard + oms:admin | Net/gross exposure per instrument |
| GET | /admin/risk/dashboard | JwtAuth + TenantGuard + oms:admin | Aggregated dashboard (instruments + totals) |
| GET | /admin/risk/alerts | JwtAuth + TenantGuard + oms:admin | Paginated surveillance alerts |
| POST | /risk-policy/policies | — | Create risk policy |
| POST | /risk-policy/assignments | — | Assign policy to scope |

## Dependencies
- SharedModule (AppLoggerService), ComplianceModule (SurveillanceAlertEntity for risk-dashboard queries), TenantEntity

## Idempotency
- Risk policy upsert keyed on tenantId + jurisdictionCode

## Changelog
- 2026-05-16: Added RiskDashboardService (getDashboard, getAlerts, dismissAlert) wired into AdminRiskController. RiskPolicyModule imports ComplianceModule to access SurveillanceAlertEntity.
- 2026-02-17 IST: Added risk policy scaffolding with policy/assignment entities, DTOs, APIs, tests, and docs.
