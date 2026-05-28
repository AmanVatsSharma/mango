# CLAUDE.md — apps/broker-admin

AI guidance for the broker back-office admin console. Read the root `CLAUDE.md` before this file.

---

## App Purpose & Tech Stack

**Purpose:** Full-featured broker back-office administration console. Broker admins manage clients, monitor risk, handle KYC/compliance, configure trading sessions, run reports, and operate the dealer desk from this UI.

**Tech stack:**
- **Framework:** Next.js 15 App Router
- **UI Library:** `@obsidian/obsidian-ui` (ESM package — transpiled via `transpilePackages` in `next.config.js`)
- **Language:** TypeScript
- **State:** React Context (`TenantProvider`, `AuthProvider`, `MockBrokerDataProvider`)
- **Data fetching:** Per-page `useXxxApi()` hooks → Next.js `/api/*` proxy → backend
- **Auth:** JWT stored in `sessionStorage` as `ba_access_token`, two-step OTP login
- **Multi-tenancy:** Subdomain-based tenant resolution via `TenantProvider`
- **Dev port:** 4500

---

## Commands

```bash
# From apps/broker-admin/
npm run dev          # Next.js dev (port 4500)
npm run build        # Production build
npm run lint         # ESLint

# Via Nx (from repo root)
npx nx serve broker-admin
```

**Required env vars:**
```
NEXT_PUBLIC_DEFAULT_TENANT=acme-securities   # Fallback tenant code for local dev
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000  # Backend URL (default)
```

**Local subdomain routing:**
```
# Option 1: lvh.me (wildcard DNS → 127.0.0.1)
http://demo-broker.lvh.me:4500/login

# Option 2: /etc/hosts
127.0.0.1 demo-broker.localhost
# Then visit: http://demo-broker.localhost:4500/login
```

---

## Route Structure

```
app/
├── (admin)/                 # Authenticated route group — AuthGuard-protected
│   ├── layout.tsx          # Admin shell (sidebar + topbar + notifications)
│   ├── dashboard/
│   ├── clients/[id]/
│   ├── accounts/
│   ├── orders/
│   ├── kyc-queue/
│   ├── risk-dashboard/
│   ├── exposure-limits/
│   ├── pnl/
│   ├── ibs/                # IB tree
│   ├── ib-commissions/
│   ├── dealer-desk/
│   ├── lp-console/
│   ├── copy-trading/
│   ├── pamm-manager/
│   ├── bonuses/
│   ├── promotions/
│   ├── client-groups/
│   ├── roles-permissions/
│   ├── team-members/
│   ├── audit-log/
│   ├── aml-monitor/
│   ├── surveillance/
│   ├── compliance-config/
│   ├── rules-engine/
│   ├── transactions/
│   ├── regulatory-reports/
│   ├── scheduled-reports/
│   ├── report-builder/
│   ├── retention-crm/
│   ├── pricing-rules/
│   ├── trading-sessions/
│   ├── domains/
│   ├── brand-settings/
│   ├── email-templates/
│   ├── api-webhooks/
│   ├── instruments/
│   ├── live-monitor/
│   ├── deployment/
│   ├── setup/              # Broker-specific onboarding
│   └── [page].tsx          # Stub — catches unmatched routes
├── api/[...path]/          # Next.js API proxy → backend
├── login/
└── page.tsx               # Redirects to /login or /dashboard
```

### Page API Status

| Page | Data Status |
|------|------------|
| `/login` | Real API — OTP request/verify |
| `(admin)/dashboard` | Real API (partial) |
| `(admin)/clients` | Real API — `GET /admin/users` via `useClientsApi()` |
| `(admin)/clients/[id]` | Real API — PATCH user, deactivate/reactivate |
| `(admin)/orders` | Pending — mock data |
| `(admin)/kyc-queue` | Pending — mock data |
| `(admin)/risk-dashboard` | Pending — mock data |
| `(admin)/exposure-limits` | Pending — mock data |
| All other `(admin)/*` | Pending — mock data via `MockBrokerDataProvider` |

---

## API Proxy Pattern

All `/api/*` requests are rewritten by Next.js to `http://localhost:3000/:path*` in dev mode. The proxy is disabled when `STATIC_EXPORT=true`.

**Auth header:** Every API call includes `Authorization: Bearer <ba_access_token>` from `sessionStorage`, injected by `lib/api/client.ts`.

**Key backend modules consumed:**

| Module | Used by |
|--------|---------|
| `auth` | Login (OTP request/verify, JWT validation) |
| `users` | Client list, user updates (`AdminUsersController`) |
| `admin` | Dashboard stats |
| `compliance` | KYC queue, surveillance, AML |
| `risk-policy` | Exposure/risk data, exposure limits |
| `oms` | Order monitoring |
| `accounts` | Account/balance data |
| `broker-hierarchy` | IB tree |
| `reports` | Report generation |
| `notifications` | Email templates, notification prefs |

---

## Authentication

**Login flow (two-step OTP):**
1. User submits email/phone → `POST /auth/otp/request` — server returns brand config from `GET /tenancy/brand-config?slug=<tenantCode>`
2. User submits OTP → `POST /auth/otp/verify` returns JWT (`ba_access_token`), stored in `sessionStorage`
3. `AuthGuard` on `(admin)/layout.tsx` checks for valid token on every protected route. Redirects to `/login` if missing/expired
4. v1 behavior: re-login required on expiry (no refresh token rotation yet)

---

## Multi-tenancy

`TenantProvider` reads the subdomain hostname to resolve `tenantCode`:
```
acme-securities.lvh.me:4500 → tenantCode = 'acme-securities'
```
Falls back to `NEXT_PUBLIC_DEFAULT_TENANT` env var for local dev without a subdomain.

---

## Phase 2 Wiring: Adding Real API to a Page

Pages not yet on the real API use `MockBrokerDataProvider`. To wire a page to real data:

1. **Create a `useXxxApi` hook** in `lib/api/hooks/useXxxApi.ts` — calls the backend via `lib/api/client.ts`
2. **Replace `MockBrokerDataProvider`** usage in the page component with the hook
3. **Add types from `@mango/shared-types`** for API boundary types (see type warning below)
4. **Update the README and `MODULE_DOC.md` changelog**

---

## CRITICAL: Type Sharing Warning

There are **two type sources** — do NOT mix them at API boundaries.

| Source | Location | Use for |
|--------|----------|---------|
| **Canonical** (use this) | `libs/shared/types/src/index.ts` | API boundary: `OrderSide`, `OrderType`, `OrderStatus`, `ApiResponse`, etc. (SCREAMING_SNAKE_CASE: `'BUY'`, `'MARKET'`, `'PENDING'`) |
| **Local types** (display only) | `src/lib/types.ts` | Local mock data and UI labels. Uses Title Case: `'Buy'`, `'Market'`, `'Open'` |

**Rule:** Always import from `@mango/shared-types` for anything that crosses the API boundary. The local `src/lib/types.ts` uses Title Case enums that do NOT match the backend's SCREAMING_SNAKE_CASE convention — using them for API calls will cause silent type mismatches.

```ts
// CORRECT — canonical shared types for API boundary
import { OrderSide, OrderStatus } from '@mango/shared-types';

// WRONG for API calls — src/lib/types.ts uses Title Case ('Buy'/'Sell') that does not match backend
import { OrderSide, OrderStatus } from '@/lib/types';
```

---

## Adding a New Admin Page

1. Create the route directory under `app/(admin)/` (e.g., `app/(admin)/new-page/`)
2. Add a `page.tsx` file
3. If the page needs real API data:
   - Create `lib/api/hooks/useNewPageApi.ts` following the existing pattern
   - Replace `MockBrokerDataProvider` in the page with the hook
   - Import canonical types from `@mango/shared-types`
4. Add the route to `shared/sidebar/nav-config.ts` for sidebar visibility

---

## Key Env Vars

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_DEFAULT_TENANT` | `acme-securities` | Fallback tenant code for local dev |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Backend base URL |