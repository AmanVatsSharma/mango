# Module: rbac

Short: Role and permission management for access control.

Purpose: Provide RBAC (roles and permissions) to protect routes and operations.

Files:
- rbac.module.ts — Nest module
- guards/ — roles and tenant guards
- decorators/ — metadata decorators for roles/tenant
- MODULE_DOC.md — this file

Flow diagram: `flowcharts/rbac-flow.svg`

Dependencies: users module (for role assignment later)

APIs:
- REST
  - POST /admin/rbac/roles — create role
  - GET /admin/rbac/roles — list roles
  - GET /admin/rbac/roles/:name — get role by name
  - PATCH /admin/rbac/roles/:name — update role name/description
  - DELETE /admin/rbac/roles/:name — delete role and its relations
  - POST /admin/rbac/roles/:name/users — assign role to user { userId }
  - POST /admin/rbac/roles/:name/permissions — grant permission to role { permissionName }
  - POST /admin/rbac/permissions — create permission
  - GET /admin/rbac/permissions — list permissions
  - GET /admin/rbac/permissions/:name — get permission by name
  - PATCH /admin/rbac/permissions/:name — update permission
  - DELETE /admin/rbac/permissions/:name — delete permission

Env vars: None specific

Tests: Skipped per instruction

New files (2026-05-09):
- constants/role.constants.ts      — ROLE enum (PLATFORM_OWNER, BROKER_ADMIN='admin', BROKER_OWNER, TRADER, VIEWER, SUPPORT_AGENT)
- constants/permission.constants.ts — PERMISSION enum + PLATFORM_PERMS + BROKER_DEFAULT_PERMS arrays
- guards/platform-owner.guard.ts   — two-check gate: req.user.tenantId==='platform' AND userHasAnyRole('platform', userId, [ROLE.PLATFORM_OWNER])

Note: ROLE.BROKER_ADMIN maps to string 'admin' to match existing DB rows — no migration needed.

Change-log:
- 2025-09-18 IST: Initial scaffold
- 2025-09-19 IST: Added entities (roles, permissions, user_roles, role_permissions), guards, decorators, and seeder gated by SEED_RBAC_TENANT_ID
- 2025-09-19 IST: Added admin controllers for roles/permissions, CRUD DTOs, wired into module
- 2025-09-19 IST: Secured admin endpoints with JwtAuthGuard
- 2026-05-09 IST: Added ROLE/PERMISSION constants, PlatformOwnerGuard. Exported all from index.ts.
- 2026-05-16: Extended AdminTeamController to serve both /admin/team-members and /admin/rbac/users endpoints. Added listRbacUsers (GET /admin/rbac/users), updateRbacUser (PATCH /admin/rbac/users/:id), inviteRbacUser (POST /admin/rbac/users/invite). UserEntity registered in RbacModule TypeOrmModule.forFeature for AdminTeamController injection.
