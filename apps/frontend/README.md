# Trading Frontend

**Retail trading platform frontend for end-clients.** Users register, verify KYC, fund accounts, and trade via this UI. The frontend communicates with the NestJS backend at `http://localhost:3001`.

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 15 App Router |
| UI Components | Radix UI (headless) + Shadcn-style CSS Modules |
| GraphQL | Apollo Client (`lib/graphql/`, `lib/api/graphql/`) |
| REST | Axios via `apiClient` (`lib/api/client.ts`) |
| Real-time | Socket.io WebSocket (`lib/services/websocket/`) |
| Charts | Lightweight-charts (TradingView) |
| Tables | TanStack React Table |
| Auth | JWT + refresh token in `localStorage` |

---

## Quick Start

```bash
# Install dependencies
npm install

# Run dev server (backend must already be running at localhost:3001)
npm run dev
# → Frontend available at http://localhost:3000

# Run via Nx
npx nx serve frontend
```

---

## Key Directories

| Path | Purpose |
|------|---------|
| `app/(main)/` | Pre-login / marketing routes (auth, dashboard, market-demo) |
| `app/(console)/` | Account management console (post-login) |
| `components/` | Auth forms, trading widgets, console sections, UI primitives |
| `lib/api/` | Axios client, Apollo client, REST endpoint helpers |
| `lib/services/` | Service layer — one subdirectory per domain |
| `lib/auth/` | Session management, KYC gating |
| `lib/branding/` | Broker theme, identity, marketing config |
| `lib/comms/` | Email, SMS, push notifications |
| `lib/bonus/` | Bonus and promotion service |
| `hooks/` | Shared hooks: pagination, debounce, error handling |
| `actions/` | Next.js server actions (auth flows) |
| `Branding/` | Theme config, broker identity, asset paths |

---

## Service Layer

All UI components call service functions → services call `apiClient` (Axios) or Apollo → backend modules. 21 services in `lib/services/`:

| Service | Purpose |
|---------|---------|
| `websocket/` | Socket.io client — connect, subscribe to symbols, emit `market:tick` events |
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

## Authentication

JWT + refresh token stored in `localStorage`:
- `auth_token` — access token, attached to every Axios request as `Authorization: Bearer <token>`
- `refresh_token` — used to obtain a new access token when the current one expires

**Token refresh on 401:**
1. Axios interceptor catches 401.
2. Attempts `POST /auth/refresh` with `refresh_token`.
3. Multiple in-flight 401s queue and resolve after a single refresh completes.
4. On refresh failure → redirect to `/(main)/auth/login`.

**Auth pages:** login → OTP → KYC → MPIN setup → dashboard.

---

## API Boundary

```
NEXT_PUBLIC_API_URL=http://localhost:3001   # NestJS backend
```

| Layer | Tool | Used for |
|-------|------|----------|
| REST | Axios `apiClient` | Auth, users, accounts, orders, market |
| GraphQL | Apollo Client | Dashboard data, analytics, account summary |
| WebSocket | Socket.io | Real-time market ticks (`market:tick`) |

---

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | NestJS backend base URL |

---

## Type Sharing

Types are defined in two places — be deliberate about which you use:

| Location | Use when |
|----------|----------|
| `libs/shared/types/` | Shared DTOs, entities consumed by both frontend and backend |
| Local `types/` or inline | Page-specific shapes that only the frontend uses |

Prefer `libs/shared/types/` when the same shape is used in API calls and backend responses to avoid divergence.

---

## Key Pages / Routes

| Route | Description | Auth |
|-------|-------------|------|
| `/(main)/auth/login` | Login (email/phone) | No |
| `/(main)/auth/register` | Registration | No |
| `/(main)/auth/otp-verification` | OTP verify | No |
| `/(main)/auth/mpin-setup` | Set MPIN after first login | No |
| `/(main)/auth/mpin-verify` | MPIN fast login | No |
| `/(main)/auth/kyc` | KYC verification | No |
| `/(main)/dashboard` | Post-login home | Yes |
| `/(main)/market-demo` | Market data demo | No |
| `/(console)/console` | Account management console | Yes |

---

## Contributing

### Adding a new service

1. Create `lib/services/<domain>/index.ts` — service functions that call `apiClient` or Apollo.
2. Add unit tests in `lib/services/<domain>/<domain>.test.ts`.
3. Document the service in the table above.

### Adding a route

1. Add the page file under `app/(main)/` (pre-login) or `app/(console)/` (post-login).
2. For authenticated routes, use `useAuth()` from `lib/auth/` to gate access.
3. Add navigation links where applicable.

### Adding a new API endpoint

1. Add the endpoint helper in `lib/api/endpoints/<resource>.ts` (e.g., `orders.ts`).
2. Use `apiClient` — it handles auth headers and 401 refresh automatically.
3. Do not call `fetch` or `axios` directly in components.