# Module: rbac

**Short:** Central RBAC catalog and permission guard.

**Purpose:** Provide consistent permission definitions and enforcement for admin APIs.

**Files:**
- `permissions.ts` — permission catalog, defaults, restrictions
- `admin-guard.ts` — `requireAdminPermissions` helper
- `index.ts` — public exports
- `MODULE_DOC.md` — this file

**Flow diagram (permission enforcement):**
```mermaid
flowchart TD
  A[API request] --> B[requireAdminPermissions]
  B --> C{Session valid?}
  C -->|No| D[401 Unauthorized]
  C -->|Yes| E{Role allowed?}
  E -->|No| F[403 Forbidden]
  E -->|Yes| G[AccessControlService.getConfig]
  G --> H[Resolve role permissions]
  H --> I{Permission check}
  I -->|No| F
  I -->|Yes| J[Handler executes]
```

**Dependencies:**
- `lib/services/admin/AccessControlService`
- `@/auth` for session validation

**APIs:** Used by `app/api/admin/**` and `app/api/super-admin/**` routes.

**Env vars:** none.

**Tests:** `tests/admin/access-control-guard.test.ts`

**Change-log:**
- 2026-04-01: Added `admin.users.bank.sensitive` (USERS, high) + RESTRICTED grant for SUPER_ADMIN/ADMIN; full bank/IFSC in admin UI requires this or `admin.all` (payout access audited via fund logs).
- 2026-03-28: Added `admin.session-security.read` / `admin.session-security.manage` (SECURITY) + default ADMIN grants (parity with TradeBazaar).
- 2026-01-15: Added super-admin financial manage permission and RBAC exports.
