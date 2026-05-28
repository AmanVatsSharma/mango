# Runbook: Platform Owner — Onboard Broker

**Module:** saas-control-plane  
**Last updated:** 2026-05-09  
**Audience:** DevOps / Support / On-call

---

## Overview

The Platform Owner is a special tenant (`code='platform'`) that can onboard broker tenants
via the `/saas/onboard-broker` endpoint. The `PlatformTenantSeeder` bootstraps this tenant
and assigns the `platform_owner` role to the user whose mobile is set in the env.

---

## Required Environment Variables

| Var | Required | Description |
|---|---|---|
| `PLATFORM_OWNER_MOBILE` | Required for seeder | E.164 mobile of the initial PO user (e.g. `+919999999999`). If absent, seeder skips user creation (non-fatal). |
| `PLATFORM_OWNER_EMAIL` | Optional | Email for the PO user (informational only). |
| `PLATFORM_OWNER_NAME` | Optional | Display name for the PO user. |

**No other secrets.** AWS SNS credentials (for SMS) are pulled from the standard `AWS_*` env vars
already required by `AwsSnsService`.

---

## Bootstrap Sequence (one-time per environment)

On every app start, `PlatformTenantSeeder.onApplicationBootstrap()` runs:

1. Creates tenant `code='platform', displayName='Obsidian Platform', status='ACTIVE'` if missing.
2. Ensures role `platform_owner` exists.
3. Ensures permissions `platform:tenant:create`, `platform:tenant:read`, `platform:tenant:suspend`,
   `platform:broker:provision` exist and are granted to `platform_owner`.
4. If `PLATFORM_OWNER_MOBILE` is set: finds or creates the PO user; assigns role `platform_owner`.

All steps are idempotent — safe to re-run on every restart.

**Expected log lines on first boot:**
```
PlatformTenantSeeder: platform tenant created/found
PlatformTenantSeeder: platform_owner role ensured
PlatformTenantSeeder: platform permissions granted
PlatformTenantSeeder: platform owner user assigned (mobile: +91...)
```

---

## Onboard a Broker (Manual, via curl)

### Step 1 — Get a PO access token

```bash
# Request OTP
curl -X POST http://localhost:3000/auth/otp/request \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: platform' \
  -d '{"tenantId":"platform","mobileE164":"+919999999999"}'

# OTP is logged by the backend in development (NODE_ENV=development):
#   AuthService: [DEV] OTP for +919999999999: 123456

# Verify OTP
curl -X POST http://localhost:3000/auth/otp/verify \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: platform' \
  -d '{"tenantId":"platform","mobileE164":"+919999999999","otp":"123456"}'
# → { "accessToken": "eyJ...", "refreshToken": "..." }
TOKEN=eyJ...
```

### Step 2 — Onboard a broker

```bash
curl -X POST http://localhost:3000/saas/onboard-broker \
  -H "authorization: Bearer $TOKEN" \
  -H 'x-tenant-id: platform' \
  -H 'content-type: application/json' \
  -d '{
    "brokerCode": "demo-broker",
    "brokerDisplayName": "Demo Broker",
    "adminMobileE164": "+918888888888",
    "adminName": "Demo Admin",
    "adminEmail": "admin@demo-broker.com"
  }'
# → 201 { tenantId, brokerCode, brokerId, adminUserId, resumed: false }
```

**Idempotency:** Re-submitting the same `brokerCode` returns 201 with `resumed: true`
if the tenant exists and is not suspended.

**Reserved broker codes** (will be rejected with 400):
`platform`, `admin`, `api`, `docs`, `www`, `app`, `support`, `static`, `cdn`, `mail`,
`auth`, `login`, `signup`, `register`

---

## Database Verification

After onboarding, confirm the following rows exist:

```sql
-- Tenant created
SELECT id, code, status FROM tenants WHERE code = 'demo-broker';

-- Broker entity
SELECT id, broker_code, tenant_id FROM brokers WHERE broker_code = 'demo-broker';

-- Admin user (uses tenant slug, not UUID)
SELECT id, mobile_e164, tenant_id FROM users WHERE tenant_id = 'demo-broker' AND mobile_e164 = '+918888888888';

-- Role assigned
SELECT ur.*, r.name FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE ur.user_id = '<adminUserId>';
```

---

## Re-triggering the Seeder

If the platform tenant bootstrap failed silently (non-fatal error on startup), you can re-trigger by:

1. Deleting the platform user row (not the tenant itself):
   ```sql
   DELETE FROM users WHERE tenant_id = 'platform';
   ```
2. Restarting the backend — seeder will re-create the user.

To fully re-seed (only in dev/staging, never production without approval):
```sql
DELETE FROM users WHERE tenant_id = 'platform';
-- Tenant and role rows will be kept (idempotent); only user is re-created
```

---

## Security Notes

- `PlatformOwnerGuard` checks two things: `req.user.tenantId === 'platform'` AND DB role lookup.
  A leaked broker JWT cannot access `/saas/*` even if the mobile is known — tenant isolation is enforced.
- The guard does a DB call on every `/saas/*` request. For high-traffic monitoring dashboards,
  consider Redis caching of the role assignment (`ba_role_cache:{tenantId}:{userId}`, TTL 5 min).
  This is flagged as a Phase 2 optimization. **Do NOT ship role claims in the JWT** (invalidates all tokens).
- OTP is logged in `NODE_ENV=development` only. In production, OTP is sent via AWS SNS only.

---

## Broker Admin Login (after onboarding)

The broker admin receives an SMS: `"Welcome to Demo Broker. Login at https://demo-broker.obsidian.io/login..."`

Local dev equivalent: `http://demo-broker.lvh.me:4500/login` (uses `lvh.me` wildcard DNS)

OTP login flow is identical to PO login, with `tenantId = brokerCode` instead of `'platform'`.
