# App Overview — frontend (trading-frontend)

**Status:** Complete
**Last-updated:** 2026-05-23

---

## Purpose & Users

**What it is:** Full-featured retail trading platform frontend for end-clients — the app your trading customers use to place orders, monitor positions, manage funds, and track market data.

**Who uses it:** Retail traders. They register, verify KYC, fund accounts, and trade via this UI.

**What users can do:**
- Register, login, verify OTP/mobile/KYC
- Set up MPIN for fast login
- View market data, watchlists, price charts
- Place orders (market, limit, stop-loss, stop-limit)
- Track positions and P&L
- Fund accounts (bank transfer, UPI, crypto, cheque, international wire)
- Withdraw funds
- Manage profile, bank accounts, security settings
- Referral program
- Console (account management console after login)

---

## Tech Stack

- **Framework:** Next.js 15 App Router
- **UI Components:** Radix UI (headless) + custom Shadcn-style components
- **State:** React Context (AuthProvider, ThemeProvider) + Apollo Client for GraphQL
- **API:** Axios (REST) + Apollo Client (GraphQL) — see API Client below
- **Real-time:** Socket.io WebSocket via `lib/services/websocket/`
- **Auth:** JWT + refresh token stored in `localStorage` as `auth_token` + `refresh_token`. Token refresh on 401.
- **Styling:** CSS Modules / Tailwind-style global CSS
- **Charts:** Lightweight-charts (TradingView) for candlestick charts
- **Tables:** TanStack React Table
- **Dev port:** 3000 (backend at 3001, frontend at 3000 by default)

---

## Directory Structure

```
apps/frontend/
├── app/
│   ├── (main)/                  # Pre-login / marketing routes
│   │   ├── auth/                # Full auth flow: login, register, OTP, KYC, MPIN
│   │   ├── dashboard/            # Post-login main dashboard
│   │   ├── market-demo/
│   │   └── test*/
│   ├── (console)/               # Account management console (post-login)
│   │   └── console/
│   ├── console/                 # Root redirect
│   ├── layout.tsx               # Root layout
│   └── error.tsx
├── components/
│   ├── auth/                    # Auth forms: login, signup, OTP, MPIN
│   ├── console/                 # Console UI: deposits, withdrawals, statements, profile
│   │   ├── sections/           # AccountSection, DepositsSection, etc.
│   │   ├── deposits/
│   │   ├── withdrawals/
│   │   ├── statements/
│   │   └── bank-accounts/
│   ├── trading/                 # Trading dashboard: widgets, order form, chart, watchlist
│   │   ├── widgets/            # Market stats, chart, order ticket, terminal panels
│   │   ├── order-drawer/
│   │   └── realtime/           # Realtime provider for price feeds
│   ├── watchlist/              # Watchlist management
│   ├── notifications/          # Notification bell + center
│   ├── risk/                   # Risk monitor
│   ├── ui/                     # Shadcn-style primitive components (Radix-based)
│   └── ...
├── lib/
│   ├── api/
│   │   ├── client.ts            # Axios client with JWT interceptor + 401 refresh
│   │   ├── graphql/
│   │   │   └── client.ts       # Apollo Client setup
│   │   └── endpoints/          # REST endpoint helpers
│   │       ├── auth.ts
│   │       ├── accounts.ts
│   │       ├── orders.ts
│   │       ├── market.ts
│   │       └── users.ts
│   ├── services/                # Service layer (one dir per domain)
│   │   ├── admin/             # Admin data hooks (pagination, filters)
│   │   ├── analytics/         # Analytics queries
│   │   ├── audit/            # Audit trail
│   │   ├── cache/            # In-memory cache
│   │   ├── console/          # Console data service (account, P&L, statements)
│   │   ├── export/           # Data export (CSV/PDF)
│   │   ├── funds/            # Deposit/withdrawal logic
│   │   ├── logging/          # Client-side logger
│   │   ├── market-data/      # Market data fetching + caching
│   │   ├── monitoring/      # System health
│   │   ├── notifications/    # Notification management
│   │   ├── order/           # Order service
│   │   ├── position/        # Position tracking
│   │   ├── realtime/        # Realtime hooks (SSE, polling)
│   │   ├── referral/        # Referral service
│   │   ├── resilience/       # Retry, circuit breaker
│   │   ├── risk/            # Risk display
│   │   ├── search/          # Search (milli-search integration)
│   │   ├── security/        # Security utils (MFA, session)
│   │   ├── statement/       # Statement generation
│   │   ├── utils/           # Misc utilities
│   │   └── websocket/       # WebSocket client (Socket.io)
│   ├── auth/                 # Auth session management, KYC gating, account access
│   ├── branding/            # Branding config (theme, identity, marketing)
│   ├── comms/               # Communication: email, SMS, push via providers
│   ├── bonus/               # Bonus/promo service
│   └── graphql/             # Apollo client setup
├── hooks/
│   ├── admin/               # usePagination, useUrlFilters, useAdminDataFetch
│   ├── use-debounce.ts
│   ├── use-global-error-handler.ts
│   ├── use-order-status.ts
│   └── use-toast.ts
├── actions/
│   ├── auth.actions.ts      # Server actions for auth
│   └── mobile-auth.actions.ts
└── Branding/
    ├── theme.ts             # Theme config (colors, fonts)
    ├── identity.ts          # Broker identity config
    ├── assets.ts           # Asset paths
    └── marketing.ts        # Marketing copy
```

---

## Key Pages / Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/` | Root redirect | No |
| `/(main)/auth/login` | Login (email/phone) | No |
| `/(main)/auth/register` | Registration | No |
| `/(main)/auth/otp-verification` | OTP verify after register | No |
| `/(main)/auth/mpin-setup` | Set MPIN after first login | No |
| `/(main)/auth/mpin-verify` | MPIN login | No |
| `/(main)/auth/kyc` | KYC verification | No |
| `/(main)/auth/forgot-password` | Password reset | No |
| `/(main)/auth/session-security-step-up` | Step-up auth | No |
| `/(main)/dashboard` | Main dashboard (post-login home) | Yes |
| `/(main)/market-demo` | Market data demo | No |
| `/(console)/console` | Account management console | Yes |

---

## API Boundary

**Backend URL:** `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`)

**REST (via Axios `apiClient`):**
- Auth: login, register, OTP, password reset, session step-up
- Users: profile, KYC status
- Accounts: balance, statement, bank accounts
- Orders: place, cancel, history
- Market: instruments, watchlists

**GraphQL (via Apollo Client):**
- Dashboard data, analytics, account summary
- Flexible reads for dashboards and analytics

**WebSocket (via Socket.io):**
- Real-time market ticks (`market:tick` event)
- `TradingRealtimeProvider` in `components/trading/realtime/`

**Auth flow (Axios interceptor):**
1. Every request attaches `Authorization: Bearer <auth_token>` from `localStorage`.
2. On 401 response: attempt `POST /auth/refresh` with `refresh_token`.
3. On refresh failure: redirect to `/auth/login`.
4. Multiple in-flight 401s queue and resolve after refresh completes.

---

## Service Layer Architecture

The `lib/services/` directory is the central data layer. Each subdirectory is a service domain:

| Service | Purpose |
|---------|---------|
| `websocket/` | Socket.io client — connect, subscribe to symbols, handle ticks |
| `realtime/` | SSE + polling hooks for near-real-time data |
| `order/` | Order placement, modification, cancellation |
| `position/` | Position tracking + P&L calculation |
| `market-data/` | Instrument lookup, price caching |
| `console/` | Account summary, balance trend, exposure |
| `risk/` | Risk monitoring + margin display |
| `funds/` | Deposit/withdrawal orchestration |
| `admin/` | Pagination + URL filter hooks for admin data |
| `search/` | Milli-search integration for instrument search |
| `notifications/` | Client-side notification preferences |
| `audit/` | Audit trail logging |
| `referral/` | Referral tracking + commission |
| `analytics/` | Analytics data queries |
| `cache/` | In-memory cache for frequently accessed data |
| `resilience/` | Retry + circuit breaker patterns |
| `security/` | MFA, session management utils |
| `export/` | CSV/PDF export for statements |
| `statement/` | Statement generation |
| `monitoring/` | System health display |
| `logging/` | Client-side structured logging |

**Pattern:** UI components call service functions → services call `apiClient` or Apollo → backend modules.

---

## How to Run Locally

```bash
# From repo root
cd apps/frontend
npm run dev

# Or via nx
npx nx serve frontend

# Backend must be running at localhost:3001
# Frontend runs at localhost:3000
```

**Required env vars:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001   # NestJS backend URL
```

**Auth required flows:** After running `npm run dev`, visit `/(main)/auth/login` to start the auth flow.