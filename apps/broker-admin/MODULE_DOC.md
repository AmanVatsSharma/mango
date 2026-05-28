# Module: broker-admin

**Short:** Broker Administration Console — full-featured broker back-office UI.

**Purpose:** Provide broker admins a complete operational interface: client management,
risk controls, compliance, finance, IB tree, trading operations, team management.

**Architecture:**
- Next.js 15 App Router, port 4500
- `(admin)` route group — all authenticated routes protected by AuthGuard
- `MockBrokerDataProvider` provides mock data for pages not yet wired to real API
- Per-page `useXApi()` hooks swap in real API data one screen at a time

**Auth:**
- `TenantProvider` — resolves broker code from subdomain hostname (e.g. `acme-securities.localhost:4500` → `tenantCode='acme-securities'`). Falls back to `NEXT_PUBLIC_DEFAULT_TENANT`.
- `AuthProvider` — stores JWT in sessionStorage as `ba_access_token`. Re-login on expiry (v1).
- `AuthGuard` — wraps `(admin)/layout.tsx`; redirects unauthenticated users to `/login`.
- Login page — two-step OTP flow. Fetches brand config from `GET /tenancy/brand-config?slug=tenantCode` for broker-specific branding.

**Real API connections (as of 2026-05-09):**
- `/login` — POST /auth/otp/request, POST /auth/otp/verify
- `/clients` — GET /admin/users (via useClientsApi), PATCH /admin/users/:id, POST /admin/users/:id/deactivate|reactivate

**Env vars:**
- `NEXT_PUBLIC_DEFAULT_TENANT` — tenant code for local dev without subdomain
- `NEXT_PUBLIC_API_BASE_URL` — backend URL (default: http://localhost:3000); proxied via next.config.js /api/* rewrite

**Local dev subdomain:**
For subdomain routing locally, use `lvh.me` (wildcard DNS → 127.0.0.1):
- `http://demo-broker.lvh.me:4500/login`
- Or add `/etc/hosts`: `127.0.0.1 demo-broker.localhost`

**Change-log:**
- 2026-04-24: Baseline production app — 35 modules, Obsidian shell, mock data, no auth.
- 2026-05-09: Added TenantProvider, AuthProvider, AuthGuard, login page with broker branding. Added useClientsApi() hook for /clients page (real API-backed, same shape as useBrokerData() slice). Updated UpdateUserDto+UsersService to support kycStatus updates. Other 34 modules remain on mock data pending Phase 2 per-page hooks.
