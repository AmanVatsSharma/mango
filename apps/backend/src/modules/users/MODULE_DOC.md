# Module: users

Short: Manage user accounts (mobile-first) within a tenant.

Purpose: Store and manage users identified primarily by E.164 mobile numbers; optional email.

Files:
- users.module.ts — Nest module
- users.controller.ts — HTTP controller
- users.service.ts — Business logic
- dto/ — request/response DTOs
- entities/ — DB entities
- MODULE_DOC.md — this file

Flow diagram: `flowcharts/users-flow.svg`

Dependencies: TypeORM, shared logger, config, RBAC module (guards & permissions)

APIs:
- Public/Tenant:
  - POST /users — create user
  - GET /users/:tenantId/:mobile — find by mobile
- Authenticated (self-service):
  - PATCH /users/profile — update profile/preferences
  - POST /users/verify/email/request — request email verification
  - POST /users/verify/email/confirm — confirm email verification
  - POST /users/verify/mobile/request — request mobile verification
  - POST /users/verify/mobile/confirm — confirm mobile verification
- Admin (requires JWT + X-Tenant-Id + permissions):
  - GET /admin/users — list users (query: page, limit, search)
  - GET /admin/users/:id — get one
  - POST /admin/users — create
  - PATCH /admin/users/:id — update
  - POST /admin/users/:id/deactivate — deactivate (body: { reason? })
  - POST /admin/users/:id/reactivate — reactivate

Env vars: None specific

Tests:
- Unit tests present for `users.service.ts` and `users.controller.ts` under `tests/`
- DTO shapes verified in tests using Zod schemas

Security & RBAC:
- Guards: `JwtAuthGuard`, `TenantGuard`, `PermissionsGuard`
- Permissions: `users:read`, `users:write`
- Header: `X-Tenant-Id` required for admin endpoints

Compliance checklist:
- controllers/: Yes (`users.controller.ts`, `controllers/admin-users.controller.ts`)
- services/: Yes (`users.service.ts`)
- entities/: Yes (`entities/user.entity.ts`)
- dtos/: Yes (`dto/*.dto.ts`)
- tests/: Yes (`tests/*.spec.ts`)
- index.ts re-exports: Present

Data Model (enterprise fields):
- name, countryCode, dateOfBirth, kycStatus, taxId, address, preferences,
  isActive, isLocked, lastLoginAt, lastPasswordChangeAt, marketingOptIn,
  pepFlag, amlFlag, taxResidencyCountry, fatcaStatus, primaryBankAccountMasked,
  referralCode, referralSource, acceptedTermsAt, deactivatedAt, deactivatedReason

Change-log:
- 2025-09-18 IST: Initial scaffold
- 2025-09-19 IST: Added fields for TOTP (secret + enabled); aligned columns to snake_case
- 2025-09-24 IST: Added admin endpoints with RBAC (`users:read|write`), pagination/search; enterprise user fields; new migration 1700000000008; tests and docs updated; index.ts re-exports added
- 2025-09-24 IST: Added deactivation/reactivation endpoints; migration 1700000000009; Swagger docs on controllers
- 2025-01-09 IST: Added self-service profile update and email/mobile verification endpoints
- 2026-05-09 IST: Added kycStatus field to UpdateUserDto (@IsIn ['pending','verified','rejected']). Added kycStatus update path in UsersService.update(). Enables broker admin to approve/reject KYC via PATCH /admin/users/:id.
