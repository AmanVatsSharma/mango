# Shared Types Guide — libs/shared/types

**Status:** Complete
**Last-updated:** 2026-05-23

---

## Overview

All cross-app TypeScript types live in `libs/shared/types/src/index.ts`. Every app imports from here via path alias — never duplicate the types locally.

**Import path:**
```ts
import { ApiResponse, MarketTick, OrderSide } from '@mango/shared-types'
// or
import { ApiResponse, MarketTick } from '@app/shared-types'  // alternate alias
```

---

## Type Catalog

### ApiResponse<T>

```ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}
```

**Purpose:** Standard wrapper for all REST API responses from the backend.

**When to use:** Any fetch call to a backend REST endpoint. All backend controllers must return `ApiResponse<T>`.

**Usage:**
```ts
// Backend side — return type
async createOrder(dto: CreateOrderDto): Promise<ApiResponse<OrderEntity>> { ... }

// Frontend side — response type
const res = await fetch('/api/orders', { method: 'POST', body: JSON.stringify(dto) });
const { data, error, success }: ApiResponse<Order> = await res.json();
if (!success) { showError(error.message); return; }
// data is typed as Order | undefined
```

---

### PaginatedResponse<T>

```ts
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

**Purpose:** Wraps list endpoints that support pagination (client list, order history, etc.).

**When to use:** Any list endpoint with `?page=` and `?pageSize=` query params.

**Usage:**
```ts
async function fetchClients(page = 1): Promise<PaginatedResponse<Client>> {
  const res = await fetch(`/admin/users?page=${page}&pageSize=20`);
  return res.json();
}
```

---

### ApiError

```ts
interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

**Purpose:** Standard error shape returned in `ApiResponse.error`.

**Fields:**
- `code` — machine-readable error code (e.g., `'INSUFFICIENT_MARGIN'`, `'INVALID_TOKEN'`)
- `message` — human-readable message
- `details` — optional structured data (field-level validation errors, etc.)

**Usage:**
```ts
if (!response.success && response.error) {
  if (response.error.code === 'KYC_NOT_VERIFIED') {
    router.push('/auth/kyc');
  }
}
```

---

### UserRole

```ts
type UserRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'SUPER_ADMIN';
```

**Purpose:** User role in the RBAC system. Matches the backend `Role` enum.

**Sync with backend:** The backend `Role` enum in `src/modules/rbac/entities/user-role.entity.ts` should have the same values. Currently there are two separate definitions — `UserRole` in shared types and `Role` in the backend entity. They **must be kept in sync** when adding new roles.

**Where used:**
- Frontend: `AuthProvider` decodes JWT and reads `role` claim for route guards
- broker-admin: `AuthGuard` checks role before rendering admin pages
- Backend: `@Roles('ADMIN')` decorator on protected endpoints

**Usage:**
```ts
// Frontend route guard
if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
  router.push('/dashboard');
}

// Backend controller
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController { ... }
```

---

### OrderSide

```ts
type OrderSide = 'BUY' | 'SELL';
```

**Purpose:** Direction of an order — buy or sell.

**Where used:**
- `OrderEntity` in backend OMS
- Order entry form in frontend
- broker-admin order management page

---

### OrderType

```ts
type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT';
```

**Purpose:** Order execution type.

**Fields:**
- `MARKET` — execute immediately at current market price
- `LIMIT` — execute at specified price or better
- `STOP_LOSS` — trigger market order when price reaches trigger
- `STOP_LIMIT` — trigger limit order when price reaches trigger

---

### OrderStatus

```ts
type OrderStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'PARTIAL_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';
```

**Purpose:** Current state in the order lifecycle.

**Lifecycle:** `PENDING` → `SUBMITTED` → `PARTIAL_FILLED` (optional) → `FILLED`
Any state can transition to `CANCELLED` or `REJECTED`.

**Where used:**
- Frontend: `useOrderStatus` hook, order tracking widgets
- broker-admin: order monitoring dashboard
- Backend: `OrderService` state transitions

---

### MarketTick

```ts
interface MarketTick {
  symbol: string;
  price: number;
  volume: number;
  bid: number;
  ask: number;
  timestamp: number;
}
```

**Purpose:** Real-time market quote from the WebSocket stream.

**Fields:**
- `symbol` — instrument identifier (e.g., `'NSE:RELIANCE'`)
- `price` — last traded price
- `volume` — volume at that price
- `bid` — best bid price
- `ask` — best ask price
- `timestamp` — Unix timestamp (ms) of the tick

**Where used:**
- Frontend: `TradingRealtimeProvider` consumes MarketTick stream for price widgets
- Chart panels, watchlist tickers, order book display

**Usage:**
```ts
// In TradingRealtimeProvider
socket.on('market:tick', (tick: MarketTick) => {
  updatePrice(symbol, tick);
});
```

---

## How to Add New Shared Types

1. **Add to `libs/shared/types/src/index.ts`** — add the type with a JSDoc comment explaining purpose and fields.

2. **Add to exports** — ensure the type is exported at the bottom of the file.

3. **Update this document** — add a section for the new type with purpose, usage examples, and consumer apps.

4. **Sync with backend entity if applicable** — if the type mirrors a DB entity or enum, ensure the backend entity definition matches. Open a PR in the backend module first, then update shared types.

5. **Update path alias in consuming apps** — path aliases are configured in `tsconfig.base.json`. The `@mango/shared-types` and `@app/shared-types` aliases already point here.

**Rule:** Types in shared are intentionally minimal. Do not put app-specific business logic types here — those live in the app that owns them.

---

## Relationship to Backend Enums

| Shared Type | Backend Entity/Enum | Sync Status |
|-------------|---------------------|-------------|
| `UserRole` | `UserRoleEntity` (rbac) + `Role` decorator | ⚠️ Needs verification — two separate definitions exist |
| `OrderSide` | `OrderSide` enum in OMS entity | ✅ Should match |
| `OrderType` | `OrderType` enum in OMS entity | ✅ Should match |
| `OrderStatus` | `OrderStatus` enum in OMS entity | ✅ Should match |

**Action required:** Audit `apps/backend/src/modules/rbac/entities/user-role.entity.ts` and `apps/backend/src/modules/rbac/entities/role.entity.ts` to confirm they align with `UserRole`. If they differ, reconcile them — the shared `UserRole` type is the canonical definition that both apps must conform to.