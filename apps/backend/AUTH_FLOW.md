# Auth & Authorization Flow — Obsidian Backend

> **Scope:** OTP-based authentication, JWT issuance, refresh token rotation, RBAC enforcement, and tenant isolation.
> Last updated: 2026-05-23

---

## Auth Architecture Overview

The backend uses a **mobile-first OTP + JWT** model with optional **TOTP 2FA**:

```
User mobile number (E.164)
       │
       ▼
  OTP request       ──► SNS (AWS) ──► SMS to user
       │
       ▼
  OTP verify
       │
  ┌────┴────┐
  │ 2FA?    │
  │ TOTP    │◄─── Google Authenticator
  └─────────┘
       │
       ▼
  Access token (short TTL)  ──► included in Authorization: Bearer <token>
       │
       ▼
  Refresh token (long TTL)  ──► httpOnly cookie or body response
       │
       ▼
  Refresh rotation ──► new access + refresh tokens
```

---

## OTP Flow

### Step 1 — Request OTP

```
POST /auth/otp/request
Content-Type: application/json

{ "mobileNumber": "+919876543210" }
```

**Server steps:**
1. Validate mobile number (E.164 format)
2. Rate-limit by mobile number (ThrottlerModule guard)
3. Generate 6-digit OTP; store hashed in Redis with 5-minute TTL
4. Send via AWS SNS (`AWS_SNS_SENDER_ID`) using the SNS wrapper service
5. Return `{ success: true, expiresIn: 300 }` — no OTP in response body

**Rate limit:** 3 OTP requests per mobile number per 5 minutes (enforced by ThrottlerModule).

### Step 2 — Verify OTP

```
POST /auth/otp/verify
Content-Type: application/json

{ "mobileNumber": "+919876543210", "otp": "123456" }
```

**Server steps:**
1. Fetch and validate hashed OTP from Redis
2. Delete OTP after successful validation (one-time use)
3. Look up user by mobile number (create if first-time, depending on tenant config)
4. **If 2FA enabled for this user:** initiate TOTP challenge before issuing tokens
   - `AuthService.verifyTotp(userId, totpCode)` must succeed first
5. Issue access token + refresh token
6. Store refresh token hash in `refresh_tokens` DB table
7. Update `user.lastLoginAt` to current timestamp
8. Return:
   ```json
   {
     "accessToken": "<jwt>",
     "refreshToken": "<jwt>",
     "expiresIn": 900,
     "tokenType": "Bearer"
   }
   ```

**2FA step-up:** For users with `user.twoFactorEnabled === true`, OTP verify does NOT return tokens. Instead it returns `{ challenge: "TOTP_REQUIRED" }`. The client then calls `POST /auth/totp/verify` with the TOTP code before tokens are issued.

### Step 3 — Refresh Token Rotation

```
POST /auth/refresh
Content-Type: application/json
Cookie: refreshToken=<jwt>

{ "refreshToken": "<jwt>" }   // or from cookie
```

**Server steps:**
1. Decode refresh token — verify signature with `JWT_REFRESH_SECRET`
2. Check token is not in the **revoked tokens list** (Redis or DB)
3. Check token is not expired
4. Preserve `tenantId` from token claims (never trust client-supplied tenantId here)
5. Issue new access token + new refresh token
6. Add old refresh token to revoked list with its original expiry as TTL
7. Return new token pair

---

## JWT Structure

### Access Token

**Issued by:** `AuthService.generateAccessToken(user)`
**Signed with:** `JWT_ACCESS_SECRET` / `HS256`
**Recommended TTL:** 15 minutes

```json
{
  "sub": "user-uuid",
  "userId": "user-uuid",
  "tenantId": "broker-abc",
  "role": "TRADER",
  "permissions": ["orders.create", "orders.read", "positions.read"],
  "iat": 1748000000,
  "exp": 1748000900,
  "iss": "obsidian-backend"
}
```

### Refresh Token

**Issued by:** `AuthService.generateRefreshToken(user)`
**Signed with:** `JWT_REFRESH_SECRET` / `HS256`
**Recommended TTL:** 7 days

```json
{
  "sub": "user-uuid",
  "userId": "user-uuid",
  "tenantId": "broker-abc",
  "jti": "token-uuid",       // unique ID for revocation tracking
  "iat": 1748000000,
  "exp": 1748600000,
  "iss": "obsidian-backend"
}
```

---

## RBAC Flow

```
Role assignment (admin)               Permission grant (admin)
  │                                        │
  ▼                                        ▼
role_permissions table              permission entity
  │                                        │
  ▼                                        ▼
User has role ──────────────────────► has permission?
                                         │
                                         ▼
                              @Roles('ADMIN') on controller
                                         │
                                         ▼
                              RolesGuard + JwtAuthGuard
                                         │
                              ┌──────────┴──────────┐
                              │  valid?             │ no
                              │  ───                │ ───► 403 Forbidden
                              │  yes                │
                              ▼                     ▼
                         proceed               error response
```

**Guard chain on every protected endpoint:**
1. `JwtAuthGuard` — validates access token, attaches `req.user`
2. `TenantGuard` — ensures `req.user.tenantId === req.tenantId`
3. `RolesGuard` (if `@Roles(...)` decorator present) — checks `req.user.role`

**Decorator usage:**
```ts
@Controller('orders')
@UseGuards(JwtAuthGuard, TenantGuard)
class OrdersController {
  @Post()
  @Roles('TRADER', 'ADMIN')
  createOrder(@Body() dto: CreateOrderDto) { ... }
}
```

### Roles (from `src/modules/rbac/constants/role.constants.ts`)

| Role | String value | Scope |
|---|---|---|
| `PLATFORM_OWNER` | `platform` | Platform-level (Obsidian team) |
| `BROKER_ADMIN` | `admin` | Broker admin (string `'admin'` for DB compatibility) |
| `BROKER_OWNER` | `broker_owner` | Broker-level owner |
| `TRADER` | `trader` | Trading account holder |
| `VIEWER` | `viewer` | Read-only access |
| `SUPPORT_AGENT` | `support_agent` | Support staff |

---

## Tenant Isolation

```
Incoming request
       │
       ▼
SubdomainResolverMiddleware
  Host: acme.obsidian.app
  ──────────────────────────► sets req.tenantId = "acme"

  OR

  X-Tenant-Id: acme  (explicit header — takes priority)

       │
       ▼
TenantGuard (runs after JwtAuthGuard so req.user is populated)
       │
       ▼
  req.user.tenantId === req.tenantId  ?
       │
    ┌──┴──┐
    │ yes │  proceed
    │ no  │  throw AuthorizationError('TENANT_MISMATCH')
    └─────┘
```

All data queries are scoped by `tenantId` at the repository layer. No cross-tenant data leakage is possible because TypeORM find options always include the tenant filter injected via a shared repository base.

---

## Session Management

### Refresh Token Storage

`refresh_tokens` table:
```sql
id          UUID PK
user_id     UUID FK
token_hash  VARCHAR(255)   -- bcrypt of the JWT jti
ip_address  VARCHAR(45)
user_agent  VARCHAR(512)
device_info VARCHAR(255)
expires_at  TIMESTAMPTZ
created_at  TIMESTAMPTZ
```

### Revocation List

When a refresh token is rotated, the old token's `jti` is added to a revoked list (Redis with TTL = original token expiry, or the `refresh_tokens.is_revoked` boolean flag as fallback).

### Admin Session Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/auth/users/:userId/sessions` | List all active sessions (ipAddress, userAgent, deviceInfo, createdAt, lastUsedAt, expiresAt) |
| `POST` | `/admin/auth/users/:userId/sessions/revoke` | Revoke a specific session by body `{ sessionId }` |
| `POST` | `/admin/auth/users/:userId/sessions/revoke-all` | Revoke all sessions for the user |

Supports filtering: `?ipAddress=<ip>&userAgent=<ua>&deviceInfo=<info>`

### User Session History

`GET /auth/sessions/history?limit=10` — lists the authenticated user's own session history (last N sessions, default 10, max 100).

---

## 2FA (TOTP)

- TOTP secrets are stored encrypted at rest (`user.totpSecret`)
- `user.twoFactorEnabled` boolean gates the step-up challenge
- During OTP verify: if `twoFactorEnabled`, return challenge instead of tokens
- Client then submits TOTP code to `POST /auth/totp/verify`
- TOTP codes are time-based (RFC 6238), 30-second window, 1-digit resync allowed

---

## Security Considerations

| Risk | Mitigation |
|---|---|
| Refresh token theft | Rotation on every use — stolen token becomes useless after first use |
| Token replay | Revoked list checked on every refresh |
| Cross-tenant access | `TenantGuard` enforces `user.tenantId === req.tenantId` |
| OTP brute-force | Rate limiting: max 3 OTP requests / 5 min per mobile number |
| OTP interception (SMS) | TOTP 2FA as step-up; SMS OTP is a transport, not a secret |
| Privilege escalation | RBAC checked server-side after JWT decode; role cannot be upgraded via JWT claims alone |
| Concurrent session abuse | Admin can view and revoke sessions individually or in bulk |

---

## Env Vars

| Variable | Required | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | Yes | HS256 signing secret for access tokens |
| `JWT_ACCESS_TTL` | Yes | Access token TTL (e.g. `15m`) |
| `JWT_REFRESH_SECRET` | Yes | HS256 signing secret for refresh tokens |
| `JWT_REFRESH_TTL` | Yes | Refresh token TTL (e.g. `7d`) |
| `AWS_REGION` | For OTP SMS | AWS region for SNS (e.g. `ap-south-1`) |
| `AWS_SNS_SENDER_ID` | For OTP SMS | SNS sender ID / campaign ID |
| `REDIS_URL` | For scale | Redis URL for revoked token list (optional in single-instance) |