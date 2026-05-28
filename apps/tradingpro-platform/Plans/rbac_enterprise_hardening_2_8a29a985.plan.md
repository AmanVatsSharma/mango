---
name: RBAC Enterprise Hardening 2
overview: Finish enterprise-grade permission management by removing remaining UI localStorage role checks, gating UI actions by authoritative permissions, and standardizing all admin/super-admin API routes to use Pino requestId logging + centralized AppError/mapErrorToHttp error responses (no console.*).
todos:
  - id: ui-rm-management-no-localstorage
    content: Update rm-management to use useAdminSession and permission-based gating (no localStorage role reads).
    status: completed
  - id: ui-edit-user-dialog-no-localstorage
    content: Update edit-user-dialog to use useAdminSession, gate funds override UI by admin.funds.override, and replace .then with async/await.
    status: completed
  - id: api-admin-wrapper
    content: Add an admin API wrapper/helper for requestId logging + requireAdminPermissions + AppError/mapErrorToHttp handling (Pino-only).
    status: completed
  - id: api-refactor-admin-routes
    content: Refactor /api/admin/** routes to use the wrapper and remove console.* (prioritize funds, withdrawals, cleanup, logs, users).
    status: in_progress
    dependencies:
      - api-admin-wrapper
  - id: api-refactor-super-admin-routes
    content: Refactor /api/super-admin/** routes to use the wrapper and remove console.*.
    status: completed
    dependencies:
      - api-admin-wrapper
  - id: docs-update-phase2
    content: Update module docs + changelog for the UI gating removal and API standardization.
    status: pending
    dependencies:
      - ui-rm-management-no-localstorage
      - ui-edit-user-dialog-no-localstorage
      - api-refactor-admin-routes
      - api-refactor-super-admin-routes
isProject: false
---

# RBAC + Access Control enterprise hardening (phase 2)

## What I verified (permission management correctness)

- **Server-side RBAC enforcement is broadly present**: all current `/api/admin/**` route files appear to call `requireAdminPermissions(...)` (53 files), and high-risk samples use the correct keys:
  - Funds add/withdraw: `admin.funds.manage`
  - Trading-account override: `admin.funds.override` (restricted to SUPER_ADMIN by server RBAC rules)
  - Cleanup execute: `admin.cleanup.execute`
  - Withdrawals approval: `admin.withdrawals.manage`
  - Risk config: `admin.risk.read/manage`
  - Super-admin finance endpoints: `admin.super.financial.read/manage`

## Gaps to harden (what’s still not enterprise-grade)

- **UI still has a couple of localStorage role checks** (non-reactive / non-authoritative):
  - `[components/admin-console/rm-management.tsx](/home/amansharma/Desktop/DevOPS/tradingpro-platform/components/admin-console/rm-management.tsx)`
  - `[components/admin-console/edit-user-dialog.tsx](/home/amansharma/Desktop/DevOPS/tradingpro-platform/components/admin-console/edit-user-dialog.tsx)`
- **API route quality varies**: many `/api/admin/**` and `/api/super-admin/**` routes still use `console.*` and inconsistent error shapes, rather than the repo-standard **Pino + requestId + AppError/mapErrorToHttp**.

## Selected scope (per your choices)

- Implement both:
  - **Remove remaining UI localStorage gating** and gate by provider permissions.
  - **Standardize admin/super-admin API logging + error handling** (Pino-only).

## Implementation plan

### 1) UI: remove remaining localStorage gating

- Update `[components/admin-console/rm-management.tsx](/home/amansharma/Desktop/DevOPS/tradingpro-platform/components/admin-console/rm-management.tsx)`
  - Replace `localStorage.getItem('session_user_role')` with `useAdminSession()`.
  - Gate any UI-only “privileged” actions using `permissions.includes('admin.users.manage')` / `admin.users.rm` / etc (whichever is appropriate for RM operations).
- Update `[components/admin-console/edit-user-dialog.tsx](/home/amansharma/Desktop/DevOPS/tradingpro-platform/components/admin-console/edit-user-dialog.tsx)`
  - Replace localStorage role with `useAdminSession()`.
  - Gate the “Trading account funds (Super Admin only)” section by **permission** (`admin.funds.override`) instead of role string.
  - Convert the `.then()` fetch chain to `async/await` (repo style).

### 2) API: standardize logging + error handling (Pino-only)

- Create a small helper (single source of truth) to reduce repetition:
  - e.g. `lib/rbac/admin-api.ts` (name TBD) that:
    - Initializes `withRequest({ requestId, route })`
    - Calls `requireAdminPermissions(req, requiredPermission)`
    - Wraps handler in `try/catch` and returns `mapErrorToHttp(...)`
    - Logs `logger.debug/info/error({ err, requestId })`
- Refactor API routes to use the helper and remove `console.*`:
  - Start with the most sensitive and frequently used endpoints:
    - `[app/api/admin/users/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/users/route.ts)`
    - `[app/api/admin/funds/add/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/funds/add/route.ts)`
    - `[app/api/admin/funds/withdraw/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/funds/withdraw/route.ts)`
    - `[app/api/admin/withdrawals/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/withdrawals/route.ts)`
    - `[app/api/admin/cleanup/execute/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/cleanup/execute/route.ts)`
    - `[app/api/admin/logs/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/logs/route.ts)`
  - Then refactor the remaining `/api/admin/**` and `/api/super-admin/**` routes to be consistent.

### 3) Docs/changelog

- Update module docs + changelog entries:
  - `[components/admin-console/MODULE_DOC.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/components/admin-console/MODULE_DOC.md)`
  - `[docs/super_admin/ACCESS_CONTROL.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/docs/super_admin/ACCESS_CONTROL.md)`
  - If we add an API wrapper under RBAC/observability, also update `[lib/rbac/MODULE_DOC.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/rbac/MODULE_DOC.md)` (or the docs mirror under `docs/modules/rbac/MODULE_DOC.md`).

## Mermaid (standardized admin API flow)

```mermaid
flowchart TD
  Client[AdminConsoleUI] --> ApiRoute[ApiRoute_/api/admin/x]
  ApiRoute --> Logger[withRequest_requestId]
  ApiRoute --> Guard[requireAdminPermissions]
  Guard --> RBAC[AccessControlService_getConfig]
  ApiRoute --> Handler[BusinessLogic]
  ApiRoute --> ErrMap[mapErrorToHttp]
```



