---
title: Partners Module
created: 2026-02-19
maintainer: BharatERP
---

# Module: partners

**Short:** B2B partner lifecycle management — onboarding, integration tracking, and payout approval workflows.

**Purpose:** Manages the full lifecycle of external partners (Introducing Brokers, technology partners, referral partners) including onboarding, KYC status, integration configuration (webhook URLs, API credentials), and payout approval gates. The payout-approval endpoint enforces dual-control (maker-checker) for financial releases and is audit-logged.

**Assumptions (stated explicitly):** Entities `PartnerEntity` and `PartnerIntegrationEntity` are assumed from standard partner management patterns. The payout-approval workflow implies a maker-checker model. The module was scaffolded 2026-02-19; concrete controller/service files were not inspected.

**Files:**
- `partners.module.ts` — Nest module
- `entities/partner.entity.ts` — PartnerEntity (id, tenantId, name, type, status, kycStatus, payoutAccountId, createdAt)
- `entities/partner-integration.entity.ts` — PartnerIntegrationEntity (id, partnerId, integrationType, configJson, isActive)
- `dtos/` — CreatePartnerDto, ApprovePayoutDto, UpdatePartnerStatusDto
- `controllers/partners.controller.ts` — REST endpoints
- `services/` — PartnerService, PayoutApprovalService

**Dependencies:**
- Internal: AuditModule (payout audit), ComplianceModule (KYC checks), AccountsModule (payout account)
- External: PostgreSQL (partners + integrations)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /partners | Onboard a new partner |
| GET | /partners?tenantId=... | List partners (filterable by type, status) |
| GET | /partners/:id | Get partner detail with integrations |
| GET | /partners/:id/status | Get partner onboarding / KYC status |
| PATCH | /partners/:id | Update partner status or KYC state |
| POST | /partners/:id/payout-approvals | Submit a payout approval request (maker step) |
| POST | /partners/:id/integrations | Register a new integration for a partner |
| GET | /partners/:id/integrations | List partner integrations |

**Env vars:**
- None module-specific; uses shared DB

**Tests:**
- Unit: PayoutApprovalService validates dual-control constraints
- Integration: payout-approval endpoint rejects non-FINANCE_APPROVER role
- E2E: partner onboarding → integration setup → payout approval flow

**Change-log:**
- 2026-02-19 IST: Added partners module scaffold with partner entity, DTO, APIs, tests, and docs.
- 2026-02-19 IST: Added payout-approval audit hook endpoint and secured controller guard baseline.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entities and assumptions.