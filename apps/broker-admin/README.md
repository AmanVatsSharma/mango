# Broker Admin Console

**Broker back-office administration console.** Broker admins manage clients, monitor risk, handle KYC/compliance, configure trading sessions, and run reports from this UI. It connects to the NestJS backend at `http://localhost:3000` via a Next.js API proxy.

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 15 App Router |
| UI Library | `@obsidian/obsidian-ui` (ESM — transpiled via `transpilePackages` in next.config.js) |
| Language | TypeScript |
| State | React Context (`TenantProvider`, `AuthProvider`, `MockBrokerDataProvider`) |
| Data fetching | Per-page `useXxxApi()` hooks → Next.js `/api/*` proxy → backend |
| Auth | JWT stored in `sessionStorage` as `ba_access_token`, two-step OTP login |
| Multi-tenancy | Subdomain-based tenant resolution via `TenantProvider` |
| Dev port | 4500 |

---

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
# → Console available at http://localhost:4500

# Run via Nx
npx nx serve broker-admin

# Required env vars (set in .env.local or shell)
NEXT_PUBLIC_DEFAULT_TENANT=acme-securities   # fallback tenant code for local dev
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000  # backend URL (default)
```

**Subdomain routing locally:** Use `lvh.me` (wildcard DNS resolves to `127.0.0.1`):
```
http://demo-broker.lvh.me:4500/login
```
Or add to `/etc/hosts`:
```
127.0.0.1 demo-broker.localhost
```

---

## Directory Structure

```
apps/broker-admin/src/
├── app/
│   ├── (admin)/              # Authenticated route group — AuthGuard-protected
│   │   ├── layout.tsx       # Admin shell (sidebar + topbar + notifications)
│   │   ├── dashboard/
│   │   ├── clients/[id]/
│   │   ├── accounts/
│   │   ├── orders/
│   │   ├── kyc-queue/
│   │   ├── risk-dashboard/
│   │   ├── exposure-limits/
│   │   ├── pnl/
│   │   ├── ibs/             # IB tree
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
│   │   ├── setup/           # Broker-specific onboarding
│   │   ├── [page].tsx       # Stub — catches all unmatched routes
│   │   └── [...stub]/
│   ├── api/[...path]/       # Next.js API proxy → backend
│   ├── login/
│   ├── layout.tsx
│   └── page.tsx            # Redirects to /login or /dashboard
├── lib/
│   ├── api/
│   │   ├── client.ts        # Fetch client with Authorization header injection
│   │   └── hooks/          # One useXxxApi() hook per admin page
│   ├── auth/
│   │   ├── auth-context.tsx  # AuthProvider — JWT in sessionStorage
│   │   ├── auth-guard.tsx     # Redirects unauthenticated to /login
│   │   └── setup-guard.tsx   # Redirects if broker not set up
│   ├── tenant/
│   │   └── tenant-context.tsx # TenantProvider — resolves tenantCode from subdomain
│   ├── mock-data-context.tsx  # MockBrokerDataProvider — mock data for un-wired pages
│   └── mock-data.ts
├── shared/
│   ├── sidebar/nav-config.ts  # Sidebar nav sections + route config
│   ├── topbar/topbar.tsx
│   ├── notifications/notifications-panel.tsx
│   ├── command-palette/command-palette.tsx
│   └── components/module-coming-soon.tsx
└── app/global.css
```

---

## Page Inventory

| Route | Page | Data Status |
|-------|------|------------|
| `/login` | OTP login with broker branding | Real API |
| `(admin)/dashboard` | Broker ops overview | Real API (partial) |
| `(admin)/clients` | Client list | Real API (`GET /admin/users`) |
| `(admin)/clients/[id]` | Client detail | Real API (PATCH/activate/deactivate) |
| `(admin)/orders` | Order monitor | Pending |
| `(admin)/kyc-queue` | KYC review queue | Pending |
| `(admin)/risk-dashboard` | Risk monitoring | Pending |
| `(admin)/exposure-limits` | Exposure limits | Pending |
| `(admin)/pnl` | P&L reports | Pending |
| `(admin)/ibs` | IB tree | Pending |
| `(admin)/ib-commissions` | IB commissions | Pending |
| `(admin)/dealer-desk` | Dealer desk | Pending |
| `(admin)/lp-console` | LP console | Pending |
| `(admin)/copy-trading` | Copy trading management | Pending |
| `(admin)/pamm-manager` | PAMM manager | Pending |
| `(admin)/bonuses` | Bonus management | Pending |
| `(admin)/promotions` | Promotions | Pending |
| `(admin)/client-groups` | Client groups | Pending |
| `(admin)/roles-permissions` | Roles & permissions | Pending |
| `(admin)/team-members` | Team management | Pending |
| `(admin)/audit-log` | Audit log | Pending |
| `(admin)/aml-monitor` | AML monitor | Pending |
| `(admin)/surveillance` | Compliance surveillance | Pending |
| `(admin)/compliance-config` | Compliance configuration | Pending |
| `(admin)/rules-engine` | Rules engine | Pending |
| `(admin)/transactions` | Transaction history | Pending |
| `(admin)/regulatory-reports` | Regulatory reports | Pending |
| `(admin)/scheduled-reports` | Scheduled reports | Pending |
| `(admin)/report-builder` | Report builder | Pending |
| `(admin)/retention-crm` | Retention CRM | Pending |
| `(admin)/pricing-rules` | Pricing rules | Pending |
| `(admin)/trading-sessions` | Trading session management | Pending |
| `(admin)/domains` | Domain management | Pending |
| `(admin)/brand-settings` | Branding settings | Pending |
| `(admin)/email-templates` | Email templates | Pending |
| `(admin)/api-webhooks` | API & webhooks | Pending |
| `(admin)/instruments` | Instrument management | Pending |
| `(admin)/live-monitor` | Live monitor | Pending |
| `(admin)/deployment` | Deployment management | Pending |
| `(admin)/setup` | Broker onboarding | Pending |

---

## API Proxy Setup

All `/api/*` requests are rewritten by Next.js to `http://localhost:3000/:path*` in dev mode. Requests are proxied only — the proxy is disabled when `STATIC_EXPORT=true`.

**Auth header:** Every API call includes `Authorization: Bearer <ba_access_token>` from `sessionStorage`, injected by `lib/api/client.ts`.

**Key backend modules:**

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
1. User submits email/phone → `POST /auth/otp/request` — server returns brand config from `GET /tenancy/brand-config?slug=<tenantCode>`.
2. User submits OTP → `POST /auth/otp/verify` returns JWT (`ba_access_token`), stored in `sessionStorage`.
3. `AuthGuard` on `(admin)/layout.tsx` checks for valid token on every protected route. Redirects to `/login` if missing/expired.
4. v1 behavior: re-login required on expiry (no refresh token rotation yet).

---

## Multi-tenancy

`TenantProvider` reads the subdomain hostname to resolve `tenantCode`:
```
acme-securities.lvh.me:4500 → tenantCode = 'acme-securities'
```
Falls back to `NEXT_PUBLIC_DEFAULT_TENANT` env var for local dev without a subdomain.

---

## Phase 2 — Wiring Pages to Real API

Pages not yet on the real API use `MockBrokerDataProvider`. To wire a page to real data:

1. Create `lib/api/hooks/useXxxApi.ts` — calls the backend via `lib/api/client.ts`.
2. Replace `MockBrokerDataProvider` usage in the page component with the hook.
3. Add types from `@mango/shared-types` or define page-specific DTOs locally.
4. Update this README and `MODULE_DOC.md` changelog.

---

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_DEFAULT_TENANT` | `acme-securities` | Fallback tenant code for local dev |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Backend base URL |