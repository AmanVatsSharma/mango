## Super Admin Access Control

- Role hierarchy: SUPER_ADMIN > ADMIN > MODERATOR > USER
- Admin console UI (`/admin-console/**`): ADMIN, MODERATOR, SUPER_ADMIN (middleware gate)
- Admin APIs (`/api/admin/**`): `requireAdminPermissions` with permission keys
- Super Admin APIs (`/api/super-admin/**`): `admin.super.financial.read/manage` permissions
- Access control config stored in `SystemSettings` key `rbac_role_permissions_v1`
- Admin console UI gating is driven by `AdminSessionProvider` (fetches `/api/admin/me`) for reactive role/permission state.
- Access Control UI available to `admin.access-control.view` and `admin.access-control.manage`
- RBAC change auditing stores per-role permission diffs in `tradingLog.details.diff` for traceability.

Flow:
1. Request enters middleware for admin-console UI routes
2. API route calls `requireAdminPermissions`
3. `AccessControlService` loads RBAC config (cache → DB → defaults)
4. Permission check passes or returns 401/403
5. Handler executes on success
