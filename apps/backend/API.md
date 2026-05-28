# API Reference — Obsidian Backend

> **Scope:** All network-facing interfaces of the NestJS backend — REST, GraphQL, WebSocket, SSE.
> Last updated: 2026-05-23

---

## API Layers

The backend exposes four protocol layers, each suited to different interaction patterns.

| Layer | Protocol | Use case |
|---|---|---|
| **REST** | HTTPS/JSON | Transactional writes — orders, auth, admin ops |
| **GraphQL** | POST `/graphql` | Aggregation — dashboards, user-facing queries, bulk reads |
| **WebSocket** | Socket.IO `/ws/prana` | Realtime push — ticks, order/position updates |
| **SSE** | `text/event-stream` | One-way streams — quote feeds, order event feeds |

---

## REST Conventions

### ApiResponse<T> Wrapper

Every REST response is wrapped to provide a consistent shape:

```ts
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;    // machine-readable error code
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    timestamp: string;   // ISO 8601
  };
};
```

### Idempotency

`POST` endpoints that create or mutate state accept an optional `Idempotency-Key` header.
The backend stores the key + response for 24 hours. Replaying the same key returns the cached response without re-executing the operation.

### Tenant Isolation Headers

```
X-Tenant-Id: <tenant-id>   // required on every request
```

Tenancy is resolved in two ways (first match wins):
1. `X-Tenant-Id` request header — explicit per-request override
2. `SubdomainResolverMiddleware` — extracts tenant slug from the `Host` header (e.g. `acme.obsidian.app` → `acme`)

Both flows inject `req.tenantId` into the request context. `TenantGuard` enforces it at the controller level.

### Rate Limiting

Global throttle: **100 req / 60 s** per tenant (configured via `ThrottlerModule`).
A `TenantThrottlerGuard` (bound via `APP_GUARD`) applies this limit tenant-scoped.
Override per-route with `@UseGuards(ThrottlerGuard)` + `@Throttle(...)` decorator.

---

## GraphQL Conventions

### Schema

Built with **Pothos** + `@nestjs/graphql` (Apollo Driver).

- Schema auto-generated to `src/generated/schema.gql` (`sortSchema: true` so diffs are clean)
- `playground` and `introspection` enabled in non-production only
- `context: ({ req }) => ({ req })` passes the Nest request object to resolvers

### CRUD Pattern

Domain modules expose auto-generated ObjectType + CRUD resolver pairs. Custom resolvers sit alongside for computed fields, relationships, and mutations that require business logic.

### Pagination

Relay-style cursor pagination for list fields:

```graphql
type UserConnection {
  edges: [UserEdge!]!;
  pageInfo: PageInfo!;
  totalCount: Int!;
}
```

### Resolvers vs Controllers

- **Controllers** → REST only — transactional writes, auth, admin ops
- **Resolvers** → GraphQL only — reads, subscriptions, complex aggregations

---

## Error Handling

### AppError Hierarchy

```
AppError (base)
├── AuthenticationError       → 401
├── AuthorizationError        → 403
├── NotFoundError            → 404
├── ConflictError            → 409
├── ValidationError          → 422
├── BusinessRuleViolation    → 422
├── RateLimitError           → 429
└── InternalServerError      → 500
```

### GlobalHttpExceptionFilter Mapping

`GlobalHttpExceptionFilter` (registered globally in `main.ts`) intercepts all exceptions:

| Error code | HTTP Status | Example |
|---|---|---|
| `AUTH_TOKEN_MISSING` | 401 | No `Authorization: Bearer <token>` |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT access token TTL exceeded |
| `AUTH_INVALID_CREDENTIALS` | 401 | Bad OTP, wrong password |
| `FORBIDDEN` | 403 | Valid JWT but insufficient role |
| `TENANT_MISMATCH` | 403 | Token tenantId !== request tenantId |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource |
| `VALIDATION_ERROR` | 422 | DTO validation failure |
| `RATE_LIMIT_EXCEEDED` | 429 | Throttler tripped |
| `INTERNAL_ERROR` | 500 | Unexpected exception |

### Error Codes Taxonomy

| Prefix | Domain |
|---|---|
| `AUTH_*` | Authentication and tokens |
| `RBAC_*` | Role and permission checks |
| `TENANT_*` | Multi-tenancy enforcement |
| `OMS_*` | Order management |
| `MARKET_*` | Market data |
| `ACCOUNT_*` | Account/balance operations |
| `VALIDATION_*` | DTO/schema validation |

---

## Swagger

- **URL:** `/docs` (when `SWAGGER_ENABLED=true`, the default)
- **Auth:** Bearer JWT (`Authorization: Bearer <access_token>`) + API Key (`X-Tenant-Id: <tenant-id>`)
- **Config** (`main.ts`):
  ```ts
  new DocumentBuilder()
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addApiKey({ type: 'apiKey', name: 'x-tenant-id', in: 'header' }, 'Tenant')
    .build();
  ```

---

## API Versioning

**Current strategy:** v1 is implicit (no `/v1` prefix). No versioning header in use yet.

For breaking changes the plan is:
- Version bump: `v2` prefix on new routes
- Old version deprecated with `Deprecation` response header + sunset date in Swagger docs
- Minimum 90-day overlap before removal

---

## Key Endpoint Groups

| Group | Modules | Example Endpoints |
|---|---|---|
| **Auth** | `auth`, `users` | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/me` |
| **Trading** | `oms`, `accounts`, `market` | `POST /orders`, `GET /orders/:id`, `GET /accounts/:id/balances`, `GET /market/quotes/:symbol` |
| **Admin** | `admin`, `rbac`, `compliance` | `GET /admin/users`, `POST /admin/rbac/roles`, `PATCH /admin/rbac/users/:id` |
| **Operations** | `settlement`, `reconciliation`, `support` | Various settlement and reconciliation triggers |
| **Realtime** | `prana-stream` | SSE `/market/quotes/stream`, SSE `/orders/stream`, WS `/ws/prana` |
| **Notifications** | `notifications` | Notification preferences and history |
| **Risk** | `risk-policy`, `limits-and-controls` | Risk limit configuration |
| **Reporting** | `reports` | Report generation and retrieval |
| **Partners** | `partners` | Partner management |
| **CRM** | `crm` | CRM entities (contacts, deals, activities) |

### Admin RBAC Detail

| Method | Path | Description |
|---|---|---|
| `POST` | `/admin/rbac/roles` | Create role |
| `GET` | `/admin/rbac/roles` | List roles |
| `GET` | `/admin/rbac/roles/:name` | Get role by name |
| `PATCH` | `/admin/rbac/roles/:name` | Update role |
| `DELETE` | `/admin/rbac/roles/:name` | Delete role |
| `POST` | `/admin/rbac/roles/:name/users` | Assign role to user |
| `POST` | `/admin/rbac/roles/:name/permissions` | Grant permission to role |
| `POST` | `/admin/rbac/permissions` | Create permission |
| `GET` | `/admin/rbac/permissions` | List permissions |
| `PATCH` | `/admin/rbac/permissions/:name` | Update permission |
| `DELETE` | `/admin/rbac/permissions/:name` | Delete permission |
| `GET` | `/admin/auth/users/:userId/sessions` | List user sessions |
| `POST` | `/admin/auth/users/:userId/sessions/revoke` | Revoke one session |
| `POST` | `/admin/auth/users/:userId/sessions/revoke-all` | Revoke all sessions |

---

## SSE Endpoints

### `GET /market/quotes/stream`

One-way SSE stream of market quotes for subscribed symbols.
- **Auth:** Bearer JWT
- **Query params:** `?symbols=RELIANCE,TCS&tenantId=<tenant-id>`
- **Format:**
  ```
  event: quote
  data: {"symbol":"RELIANCE","bid":2800.50,"ask":2801.00,"ts":"2026-05-23T10:00:00Z"}

  event: quote
  data: {"symbol":"TCS","bid":3200.00,"ask":3201.50,"ts":"2026-05-23T10:00:01Z"}
  ```

### `GET /orders/stream`

One-way SSE stream of order lifecycle events for the authenticated user.
- **Auth:** Bearer JWT
- **Events:** `order.created`, `order.updated`, `order.cancelled`, `order.filled`

---

## WebSocket

### Namespace: `/ws/prana`

Socket.IO namespace for the Prana realtime gateway.

- **Auth:** JWT passed as auth token on connect handshake
- **Redis adapter:** Enabled when `REDIS_URL` is set; allows horizontal scaling across instances
  - Falls back to single-instance in-process adapter when `REDIS_URL` is absent
- **Rooms:** Each authenticated user is joined to `user:<userId>` room

**See [REALTIME.md](./REALTIME.md) for full protocol details.**

---

## Request Lifecycle

```
Client
  │
  ▼
CORS middleware        ← validates Origin, allows credentials
  │
  ▼
Helmet                ← security headers (XSS, clickjacking, etc.)
  │
  ▼
SubdomainResolverMiddleware  ← extracts tenant from Host → req.tenantId
  │
  ▼
RequestContextMiddleware      ← sets req.requestId (UUID) for tracing
  │
  ▼
CookieParser          ← populates req.cookies
  │
  ▼
ValidationPipe        ← strips non-whitelisted fields, transforms DTOs
  │
  ▼
TenantThrottlerGuard  ← APP_GUARD: rate limits per tenant (100/60s)
  │
  ▼
Controller            ← route matching, @Roles() metadata
  │
  ▼
RolesGuard            ← checks JWT claims vs @Roles() decorator
  │
  ▼
Service               ← business logic
  │
  ▼
Repository / TypeORM  ← database access
  │
  ▼
GlobalHttpExceptionFilter  ← maps AppError hierarchy → HTTP status + ApiResponse
  │
  ▼
Client                ← ApiResponse<T> wrapper, always same shape
```

---

## Env Var Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Controls playground/introspection |
| `SWAGGER_ENABLED` | `true` | Mount Swagger at `/docs` |
| `REDIS_URL` | — | Redis connection for Socket.IO adapter |
| `JWT_ACCESS_SECRET` | — | Secret for short-TTL access tokens |
| `JWT_ACCESS_TTL` | — | Access token TTL (e.g. `15m`) |
| `JWT_REFRESH_SECRET` | — | Secret for long-TTL refresh tokens |
| `JWT_REFRESH_TTL` | — | Refresh token TTL (e.g. `7d`) |
| `AWS_REGION` | — | AWS region for SNS OTP SMS |
| `AWS_SNS_SENDER_ID` | — | SNS sender ID for OTP messages |
| `MARKET_DATA_URL` | — | Primary market data API |
| `MARKET_DATA_FALLBACK_URL` | — | Fallback market data API |
| `PRANA_TICK_THROTTLE_MS` | `1000` | Tick emission interval per user |