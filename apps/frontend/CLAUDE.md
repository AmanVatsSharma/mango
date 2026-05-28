# CLAUDE.md — apps/frontend

AI guidance for the retail trading platform frontend. Read the root `CLAUDE.md` before this file.

---

## App Purpose & Tech Stack

**Purpose:** Retail trading platform frontend for end-clients — registration, KYC, market data, order placement, position monitoring, account funding, and portfolio management.

**Tech stack:**
- **Framework:** Next.js 14 App Router
- **UI Components:** Radix UI (headless) + Shadcn-style CSS Modules
- **GraphQL:** Apollo Client (`lib/graphql/`, `lib/api/graphql/`)
- **REST:** Axios via `apiClient` (`lib/api/client.ts`)
- **Real-time:** Socket.io WebSocket (`lib/services/websocket/`)
- **Charts:** Lightweight-charts (TradingView)
- **Tables:** TanStack React Table
- **Auth:** JWT + refresh token in `localStorage` (token refresh on 401)
- **Dev port:** 3000 (backend at `http://localhost:3001`)

---

## Commands

```bash
# From apps/frontend/
npm run dev          # Next.js dev (port 3000)
npm run build        # Production build
npm run type-check   # tsc --noEmit
npm run test         # Jest

# Via Nx (from repo root)
npx nx serve frontend
npx nx build frontend
```

**Required env vars:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001   # NestJS backend URL
```

---

## Route Structure

```
app/
├── (main)/               # Pre-login / marketing routes
│   ├── auth/             # Login, register, OTP, KYC, MPIN, forgot password
│   ├── dashboard/        # Post-login home
│   └── market-demo/
├── (console)/            # Account management console (post-login)
│   └── console/
└── console/              # Root redirect
```

| Route | Auth | Description |
|-------|------|-------------|
| `/(main)/auth/login` | No | Email/phone login |
| `/(main)/auth/register` | No | Registration |
| `/(main)/auth/otp-verification` | No | OTP verify after register |
| `/(main)/auth/mpin-setup` | No | Set MPIN after first login |
| `/(main)/auth/mpin-verify` | No | MPIN fast login |
| `/(main)/auth/kyc` | No | KYC verification |
| `/(main)/dashboard` | Yes | Post-login home |
| `/(main)/market-demo` | No | Market data demo |
| `/(console)/console` | Yes | Account management console |

---

## API Boundary

There are three API layers — use each for its intended purpose.

### REST (Axios `apiClient`)
For transactional writes and simple reads. Auth headers and 401 refresh are handled automatically.
- **Import:** `import { apiClient } from '@/lib/api/client'`
- **Use for:** Auth (login, register, OTP), users (profile, KYC), accounts (balance, statements), orders (place, cancel, history), market (instruments, watchlists)

### GraphQL (Apollo Client)
For complex dashboard data, analytics, and flexible reads.
- **Import:** `import { apolloClient } from '@/lib/api/graphql/client'`
- **Use for:** Dashboard data, account summary, analytics queries

### WebSocket (Socket.io)
For real-time market ticks — the single source of live price data.
- **Service:** `lib/services/websocket/`
- **Event:** `market:tick` — emitted with `MarketTick` shape
- **Consumer:** `TradingRealtimeProvider` in `components/trading/realtime/`

**Never call `fetch` or `axios` directly in components** — always go through `apiClient` or Apollo.

---

## Authentication Flow

1. User logs in → backend returns `auth_token` (JWT) + `refresh_token` → stored in `localStorage`
2. Every Axios request attaches `Authorization: Bearer <auth_token>` via interceptor
3. On 401 response: interceptor attempts `POST /auth/refresh` with `refresh_token`
4. Multiple in-flight 401s queue and resolve after a single refresh completes
5. On refresh failure: redirect to `/(main)/auth/login`

Auth pages flow: login → OTP → KYC → MPIN setup → dashboard

---

## Service Layer

All data fetching flows through `lib/services/`. Each subdirectory is a domain. **UI components call service functions, not API clients directly.**

| Service | Purpose |
|---------|---------|
| `websocket/` | Socket.io client — connect, subscribe, emit `market:tick` events |
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

---

## CRITICAL: Type Sharing Warning

There are **two type sources** — do NOT mix them.

| Source | Location | Use for |
|--------|----------|---------|
| **Canonical** (use this) | `libs/shared/types/src/index.ts` | API boundary types: `OrderSide`, `OrderType`, `OrderStatus`, `MarketTick`, `ApiResponse`, etc. |
| **Local duplicate** (do NOT use) | `lib/hooks/types/realtime-trading.types.ts` | Local types that do NOT match canonical shared types |

**Rule:** Always import from `@mango/shared-types` for API boundary types. The local types file is out of sync and must not be used for data that flows to/from the backend.

```ts
// CORRECT — canonical shared types
import { OrderSide, OrderStatus, MarketTick } from '@mango/shared-types';

// WRONG — local types (out of sync with backend)
import { OrderSide, OrderStatus } from '@/lib/hooks/types/realtime-trading.types';
```

---

## Adding a New Route

1. Add the page file under `app/(main)/` (pre-login) or `app/(console)/` (post-login)
2. For authenticated routes, use `useAuth()` from `lib/auth/` to gate access
3. Add navigation links where applicable
4. For server actions, add to `actions/` directory (e.g., `actions/auth.actions.ts`)

---

## Adding a New Service

1. Create `lib/services/<domain>/index.ts` — service functions calling `apiClient` or Apollo
2. Add unit tests in `lib/services/<domain>/<domain>.test.ts`
3. Document in the service table above

---

## Adding a New API Endpoint

1. Add the endpoint helper in `lib/api/endpoints/<resource>.ts` (e.g., `orders.ts`)
2. Use `apiClient` — it handles auth headers and 401 refresh automatically
3. Do not call `fetch` or `axios` directly in components