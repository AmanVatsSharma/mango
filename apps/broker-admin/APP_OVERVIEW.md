# App Overview — broker-admin

**Status:** Complete
**Last-updated:** 2026-05-23

---

## Purpose & Users

**What it is:** Full-featured broker back-office administration console built with Next.js.

**Who uses it:** Broker admins, compliance officers, dealer desk operators, and support staff at brokerage firms. It provides complete operational control over: client management, risk monitoring, KYC/compliance, finance/accounts, IB tree, trading operations, and team management.

**What brokers use it for:** Day-to-day broker operations — onboarding clients, monitoring exposure, reviewing KYC, managing IB commissions, handling deposits/withdrawals, running compliance surveillance, and generating reports.

---

## Tech Stack

- **Framework:** Next.js 15 App Router
- **UI Library:** `@obsidian/obsidian-ui` (ESM package, requires `transpilePackages` in Next config)
- **Language:** TypeScript
- **State:** React Context (TenantProvider, AuthProvider, MockBrokerDataProvider)
- **Data fetching:** Per-page `useXxxApi()` hooks → REST API calls proxied through Next.js `/api/*` rewrite to backend at `http://localhost:3000`
- **Auth:** JWT stored in `sessionStorage` as `ba_access_token`. Two-step OTP login flow.
- **Multi-tenancy:** Subdomain-based tenant resolution via `TenantProvider`
- **Styling:** CSS Modules / global CSS (Shadcn UI components from obsidian-ui)
- **Dev port:** 4500

---

## Directory Structure

```
apps/broker-admin/src/
├── app/
│   ├── (admin)/              # Authenticated route group (AuthGuard-protected)
│   │   ├── layout.tsx        # Admin shell — sidebar + topbar + notifications
│   │   ├── dashboard/
│   │   ├── clients/          # Client list + detail page [id]/
│   │   ├── accounts/
│   │   ├── orders/
│   │   ├── kyc-queue/
│   │   ├── risk-dashboard/
│   │   ├── exposure-limits/
│   │   ├── pnl/
│   │   ├── ibs/              # IB tree
│   │   ├── ib-commissions/
│   │   ├── dealer-desk/
│   │   ├── lp-console/
│   │   ├── copy-trading/
│   │   ├── pamm-manager/
│   │   ├── bonuses/
│   │   ├── promotions/
│   │   ├── client-groups/
│   │   ├── roles-permissions/
│   │   ├── team-members/
│   │   ├── audit-log/
│   │   ├── aml-monitor/
│   │   ├── surveillance/
│   │   ├── compliance-config/
│   │   ├── rules-engine/
│   │   ├── transactions/
│   │   ├── regulatory-reports/
│   │   ├── scheduled-reports/
│   │   ├── report-builder/
│   │   ├── retention-crm/
│   │   ├── pricing-rules/
│   │   ├── trading-sessions/
│   │   ├── domains/
│   │   ├── brand-settings/
│   │   ├── email-templates/
│   │   ├── api-webhooks/
│   │   ├── instruments/
│   │   ├── live-monitor/
│   │   ├── deployment/
│   │   ├── setup/             # Broker-specific onboarding/setup
│   │   ├── [page].tsx        # Stub — catches all other routes
│   │   └── [...stub]/
│   ├── api/[...path]/route.ts # Next.js API proxy → backend
│   ├── login/
│   ├── layout.tsx
│   ├── page.tsx               # Redirects to /login or /dashboard
│   └── global-error.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts          # Fetch client with auth token injection
│   │   └── hooks/
│   │       ├── use-clients.ts
│   │       ├── use-orders.ts
│   │       ├── use-kyc-queue.ts
│   │       ├── use-broker-dashboard.ts
│   │       └── ... (one hook per page)
│   ├── auth/
│   │   ├── auth-context.tsx   # AuthProvider — JWT in sessionStorage
│   │   ├── auth-guard.tsx     # Redirects unauthenticated to /login
│   │   └── setup-guard.tsx    # Redirects if broker not set up
│   ├── tenant/
│   │   └── tenant-context.tsx  # TenantProvider — resolves tenantCode from subdomain
│   ├── mock-data-context.tsx   # MockBrokerDataProvider for pages not yet wired
│   └── mock-data.ts
├── shared/
│   ├── sidebar/
│   │   ├── sidebar.tsx        # Admin sidebar with nav sections
│   │   └── nav-config.ts      # Navigation config (all sections)
│   ├── topbar/
│   │   └── topbar.tsx
│   ├── notifications/
│   │   └── notifications-panel.tsx
│   ├── command-palette/
│   │   └── command-palette.tsx
│   └── components/
│       └── module-coming-soon.tsx
└── app/global.css
```

---

## Key Pages / Routes

| Route | Page | Status |
|-------|------|--------|
| `/login` | OTP login with broker branding | Real API |
| `(admin)/dashboard` | Broker ops overview | Real API (partial) |
| `(admin)/clients` | Client list | Real API (`GET /admin/users`) |
| `(admin)/clients/[id]` | Client detail | Real API (PATCH user, deactivate/reactivate) |
| `(admin)/orders` | Order monitor | Real API (pending) |
| `(admin)/kyc-queue` | KYC review queue | Real API (pending) |
| `(admin)/risk-dashboard` | Risk monitoring | Real API (pending) |
| `(admin)/exposure-limits` | Exposure limits | Real API (pending) |
| All other `(admin)/*` | Module pages | Mock data (pending Phase 2 hooks) |

**API Status (as of 2026-05-09):**
- `/login` → `POST /auth/otp/request`, `POST /auth/otp/verify` — wired
- `/clients` → `GET /admin/users` via `useClientsApi()` — wired
- All other pages → `MockBrokerDataProvider` — mock data pending per-page API hooks

---

## API Boundary

**Proxy setup:** All `/api/*` requests are rewritten by Next.js to `http://localhost:3000/:path*` (configured in `next.config.js`). The proxy runs only in dev mode — `STATIC_EXPORT=true` disables it.

**Key backend modules called:**
- `auth` — OTP request/verify, JWT validation
- `users` — client list, user updates (`AdminUsersController`)
- `admin` — dashboard stats
- `compliance` — KYC queue
- `risk-policy` — exposure/risk data
- `oms` — order monitoring
- `accounts` — account/balance data
- `broker-hierarchy` — IB tree
- `reports` — report generation
- `notifications` — email templates, notification prefs

**Auth header:** All API calls include `Authorization: Bearer <ba_access_token>` from `sessionStorage`.

---

## Authentication Model

1. User visits `/login` and enters email/phone.
2. `POST /auth/otp/request` sends OTP — server returns brand config from `GET /tenancy/brand-config?slug=<tenantCode>`.
3. User submits OTP → `POST /auth/otp/verify` returns JWT (`ba_access_token`) stored in `sessionStorage`.
4. `AuthGuard` on `(admin)/layout.tsx` checks for valid token on every protected route. Redirects to `/login` if missing/expired.
5. Re-login on expiry is the v1 behavior — no refresh token rotation yet.

**Multi-tenancy:** `TenantProvider` reads subdomain hostname to resolve `tenantCode` (e.g., `acme-securities.lvh.me:4500` → `'acme-securities'`). Falls back to `NEXT_PUBLIC_DEFAULT_TENANT` env var for local dev.

---

## State Management

- `TenantProvider` (React Context) — current tenant code
- `AuthProvider` (React Context) — current user + JWT token
- `MockBrokerDataProvider` (React Context) — mock data for pages not yet on real API
- Per-page `useXxxApi()` hooks — data fetching + loading/error state for each page

---

## How to Run Locally

```bash
# From repo root
cd apps/broker-admin
npm run dev

# Or via nx
npx nx serve broker-admin
```

Then open `http://localhost:4500`.

**For subdomain routing locally:**
```bash
# Option 1: use lvh.me (wildcard DNS resolves to 127.0.0.1)
http://demo-broker.lvh.me:4500/login

# Option 2: add to /etc/hosts
127.0.0.1 demo-broker.localhost
# Then visit: http://demo-broker.localhost:4500/login
```

**Required env vars:**
```
NEXT_PUBLIC_DEFAULT_TENANT=acme-securities   # fallback tenant code for dev
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000  # backend URL (default)
```

---

## Phase 2 — Wiring Pages to Real API

Each admin page needs a `useXxxApi()` hook in `src/lib/api/hooks/`. Pattern:

1. Create `useXxxApi.ts` — calls the backend via `lib/api/client.ts`
2. Replace `MockBrokerDataProvider` usage in the page with the hook
3. Add types from `@mango/shared-types` or define page-specific DTOs locally
4. Update `MODULE_DOC.md` changelog