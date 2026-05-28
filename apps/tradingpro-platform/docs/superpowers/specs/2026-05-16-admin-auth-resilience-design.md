# Admin Auth Resilience — Enterprise-Grade Hardening

## Context

Admins visiting `/admin-console` are redirected to `/dashboard`. The middleware gate at `middleware.ts:536-549` checks `userRole !== 'ADMIN' && userRole !== 'MODERATOR' && userRole !== 'SUPER_ADMIN'`. If the role is absent or wrong in the Edge JWT decode, the admin is silently blocked.

### Chain of execution

```
GET /admin-console
  → middleware.ts:272  authEdge() wrapper
    → auth-edge.ts  NextAuth({...}) — Edge runtime, no DB access
      → jwt() callback — NO-OP, passes token through unchanged
      → session() callback — copies token.role → session.user.role
  → user = (req.auth as any)?.user
  → userRole = user?.role as string | undefined
  → isAdminRoute check: PASSES
  → role check: userRole !== 'ADMIN' ... → REDIRECT to /dashboard
```

If `userRole` is `undefined` or `"USER"`, the redirect fires regardless of what's in the DB.

---

## Root Causes

| # | File | Line | Issue | Severity |
|---|---|---|---|---|
| 1 | `auth-edge.ts` | 19 | Missing `maxAge` on session — JWT TTL may diverge from `auth.ts` | High |
| 2 | `auth-edge.ts` | 72 | No-op JWT callback — can't DB-refresh claims (expected on Edge, but no fallback) | High |
| 3 | `middleware.ts` | 357 | No fallback when `userRole` is undefined — silently redirects instead of recovering | High |
| 4 | `admin-guard.ts` | — | Bare 403 JSON with no error code — UI can't surface meaningful error | Medium |
| 5 | `admin-session-provider.tsx` | 53 | No retry/timeout on `/api/admin/me` fetch — network errors silently fail | Medium |
| 6 | No diagnostics | — | No way to know WHY a session was rejected without manual JWT decode | Medium |

---

## Design

### D1 — Align Edge JWT Config

Add `maxAge` to `auth-edge.ts` session config to match `auth.ts`.

```
auth.ts      session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }
auth-edge.ts session: { strategy: "jwt" }  ← ADD maxAge
```

**Why:** NextAuth may produce different JWT expiry headers without `maxAge`, causing Edge-Node token incompatibility.

### D2 — Edge → Node Fallback for Role Discovery

When Edge middleware detects an admin route AND the JWT contains a valid user ID BUT is missing `role` (or has wrong role), call the Node `/api/admin/me` endpoint as a fallback before redirecting.

```
middleware.ts role extraction:
  userRole = user?.role ?? undefined

  if (userRole === undefined && isLoggedIn && isAdminRoute) {
    // Fallback: call Node /api/admin/me to get fresh DB role
    const me = await fetch(`${req.nextUrl.origin}/api/admin/me`, {
      headers: { cookie: req.headers.get("cookie") ?? "" }
    })
    if (me.ok) {
      const data = await me.json()
      if (data.user?.role is ADMIN/MODERATOR/SUPER_ADMIN) {
        // Allow through — role confirmed fresh from DB
        return NextResponse.next()
      }
    }
    // Fallback failed — redirect with error code so UI can explain
    return redirect(..., "?auth_error=role_mismatch")
  }
```

**Why:** Edge can't run Prisma, but the Node API can. One internal fetch (no extra latency on cache hit) bridges the gap.

### D3 — Enhanced Error Codes in admin-guard

Replace bare 403 responses with structured error codes the UI can interpret:

```ts
// admin-guard.ts
deny(403, "Forbidden")
  ↓
deny(403, "ADMIN_ROLE_REQUIRED", "Your account does not have admin access.")
deny(403, "USER_SUSPENDED", "Your admin account has been suspended.")
deny(403, "PERMISSION_DENIED", "You lack the required permission: ...")
```

Middleware passes the same error codes through `?auth_error=` on redirect.

### D4 — admin-session-provider Robustness

Add:
- Request timeout on `/api/admin/me` fetch (5s)
- Automatic retry with exponential backoff (max 2 retries)
- Store `error` state so UI can show "Session error — retry" instead of blank screen
- Graceful degradation: if `/api/admin/me` permanently fails, show error UI (not infinite loading)

### D5 — Debugging & Diagnostics

Add structured debug logging to Edge session callback:
```
[EDGE-SESSION] token keys: id, role, kycStatus, phoneVerified, hasMpin, ...
[EDGE-SESSION] role present: true/false, value: "ADMIN"
```
These only fire when `MIDDLEWARE_DEBUG=1` — zero overhead in production.

---

## Files to Modify

| File | Changes | Owner |
|---|---|---|
| `tradingpro-platform/auth-edge.ts` | Add `maxAge`, add debug log to session callback | Subagent A |
| `tradingpro-platform/middleware.ts` | Edge→Node role fallback, debug log additions | Subagent A |
| `tradingpro-platform/lib/rbac/admin-guard.ts` | Structured error codes + messages | Subagent B |
| `tradingpro-platform/components/admin-console/admin-session-provider.tsx` | Timeout + retry + error UI | Subagent B |

---

## Testing Plan

| # | Test | Expected | Method |
|---|---|---|---|
| T1 | Decode JWT cookie at jwt.io | `role: "ADMIN"` present | Manual |
| T2 | Admin visits `/admin-console` with `MIDDLEWARE_DEBUG=1` | `[MIDDLEWARE] ✅ Admin access granted` | Manual |
| T3 | Corrupt JWT role to undefined → visit `/admin-console` | Edge→Node fallback fires, `/api/admin/me` called, role confirmed | Manual (temp hack) |
| T4 | Non-admin USER visits `/admin-console` | Redirected to `/dashboard` | Manual |
| T5 | Unauthenticated visit `/admin-console` | Redirected to `/auth/login` | Manual |
| T6 | `/api/admin/me` returns 403 (wrong role) | Structured `{ error, code }` JSON | `curl` / API test |
| T7 | Simulate network error on `/api/admin/me` | `admin-session-provider` shows retry button | Manual |
| T8 | Run `npm run type-check && npm run lint` | Clean — no errors/warnings | CI gate |
| T9 | `npm test` | All 181 tests pass | CI gate |

---

## Rollout & Safety

- Changes are **purely additive** (no behavioral changes to happy path)
- Edge→Node fallback only fires when JWT is missing role — zero overhead for correctly-formed tokens
- Debug logs guarded by `MIDDLEWARE_DEBUG=1` env flag
- No new dependencies introduced
- TypeScript strict mode throughout

---

## Success Criteria

1. Admin with `role: ADMIN` in DB can visit `/admin-console` without redirect
2. Middleware debug log shows `role: "ADMIN"` when admin is logged in
3. `npm run type-check && npm run lint` pass clean
4. `npm test` passes (all 181 test files)
5. `/api/admin/me` returns structured error codes for all 403 scenarios
6. `admin-session-provider` handles network failures gracefully