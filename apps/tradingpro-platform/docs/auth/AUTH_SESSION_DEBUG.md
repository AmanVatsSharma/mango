# AUTH_SESSION_DEBUG

Set `AUTH_SESSION_DEBUG=1` in `.env` (never in production unless actively debugging). Server logs one JSON line per `console.info` with prefix `"authSession"` and event names such as `jwt:start`, `jwt:jti_eval`, `session:strip_user`, `session:outcome`. User and JTI values are **prefix-only** (first 8 characters).

Optional **`AUTH_SESSION_DEBUG_TRACE=1`**: enables **middleware** `x-request-id`, `authSessionMw`, and traced `next()` only. **Node** `jwt` / `session` logs still need **`AUTH_SESSION_DEBUG=1`**. Use `TRACE` when you want correlation headers without verbose `jwt` spam.

**Middleware + `GET /api/auth/session`:** When `AUTH_SESSION_DEBUG=1` or `AUTH_SESSION_DEBUG_TRACE=1`, middleware emits **`authSessionMw`** JSON for `/api/auth/session` (`mw:session_request`) with `usableLogin`, `uidPrefix`, `stepUpPending`, and **`requestId`**. Responses add **`x-request-id`** (request header is propagated to Node when using `NextResponse.next`).

**Route audit (`GET /api/auth/session` body):** Enable **`AUTH_SESSION_ROUTE_AUDIT=1`** in any environment, *or* non-production with **`AUTH_SESSION_DEBUG=1`**, to log `route:session_response` with `hasUser` / `hasExpires` only (no cookies, no JWT).

For **middleware / Edge** decoding, set `AUTH_SESSION_DEBUG_EDGE=1` — logs `authSessionEdge` lines (can be very noisy on every request).

**Reverse proxy:** Behind nginx/traefik/CDN, set **`AUTH_TRUST_HOST=true`** so Auth.js trusts `X-Forwarded-Host` / proto; v5 often infers URL without a separate `AUTH_URL`. Large JWTs can be **chunked** into multiple cookies (~4KB limit).

## Registry id (`sessionRegistryJti`) vs Auth.js `jti`

Auth.js **`encode()`** sets the standard **`jti`** claim to a **new random UUID on every JWT encode** (including routine `/api/auth/session` refreshes). Storing **`UserSessionRecord.jti`** on that claim causes **`row_not_found`** on the next read because the encoded `jti` no longer matches the DB row. Use custom claim **`sessionRegistryJti`** for registry lookups; **`callbacks.jwt`** removes decoded **`jti`** so it is never treated as the registry id. **`session.user.jti`** may still mirror **`sessionRegistryJti`** for backward compatibility only.

## Symptom: response only has `expires` (no `user`)

| What you see | Interpretation |
|--------------|----------------|
| `[MIDDLEWARE] Logged in: false` on `/api/auth/session` | Edge session has no usable `user.id` (same as stripped-session or no cookie). |
| `authSessionMw` + `usableLogin: false`, `jwt:jti_eval` + `reason` not `ok` / `ok_cache` | **Bucket A:** JTI/registry → `invalidSession` → `session:strip_user` / `session:outcome.stripped: true`. |
| `session:no_resolved_id` or `session:outcome.hasUser: false` without `stripped` | **Bucket B:** JWT missing `id` / `sub` when session runs. |
| Intermittent across PM2 workers | **Bucket C:** verify identical **`NEXTAUTH_SECRET`**, **`AUTH_TRUST_HOST`**, cookie `Secure` / `SameSite` behind HTTPS. |
| `route:session_response` + `hasExpires: true`, `hasUser: false` | Confirms API returned minimal session; align with `session:outcome` and `jwt:jti_eval` on same `requestId` / timestamp. |

**Grep one login:** enable debug flags → reproduce once → grep `requestId` / `authSessionMw` → same window `authSession` lines (`jwt:*`, `session:*`, `route:session_response`).

## JTI reason codes (`jwt:jti_eval.reason`)

| reason              | Meaning |
|---------------------|---------|
| `policy_off`        | Session security policy disabled; registry skipped (valid). |
| `ok`                | Row found via Postgres, user matches, not revoked/expired, within idle TTL. |
| `ok_cache`          | Within ~45s of last full check: Redis `jti` → `userId` matched token; no DB read this round. |
| `missing_jti_or_uid`| JWT missing `jti` or user id when policy is on. |
| `row_not_found`     | No `UserSessionRecord` for this `jti`. |
| `user_mismatch`     | Row exists but `userId` ≠ token user. |
| `revoked`           | `revokedAt` set. |
| `expired_row`       | Row `expiresAt` in the past. |
| `idle_ttl_exceeded` | `lastSeenAt` older than policy idle window. |

---

Full expert brief and stack notes: keep in sync with TradeBazaar `docs/auth/AUTH_SESSION_DEBUG.md` (same instrumentation).
