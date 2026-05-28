# CLAUDE.md — apps/backend

AI guidance for the Obsidian trading platform NestJS API. Read the root `CLAUDE.md` before this file.

---

## App Purpose & Tech Stack

**Purpose:** Backend REST/GraphQL/Socket.io API for the Obsidian trading platform. Handles all broker operations, order management, compliance, KYC, real-time market data, and multi-tenant SaaS.

**Tech stack:**
- **Runtime:** Node.js + NestJS
- **ORM:** TypeORM with Postgres
- **Auth:** Passport JWT (access + refresh tokens)
- **Real-time:** Socket.io + Redis adapter (via `realtime` module, Prana-stream)
- **GraphQL:** NestJS with Pothos schema builder
- **Validation:** Zod (runtime), `class-validator` (DTOs)
- **Logging:** Pino via `AppLoggerService` — NEVER `console.log`
- **Queues:** BullMQ (job queues) + Redis
- **Multi-tenancy:** `tenantId` injected via `TenantGuard`

---

## Commands

```bash
# From apps/backend/
npm run dev:backend      # nest start --watch (port 3000)
npm run build            # tsc + nest build
npm run test             # Jest
npm run lint             # ESLint
npm run type-check       # tsc --noEmit

# Nx (from repo root)
npx nx build backend
npx nx test backend
```

**Required env vars** (see `.env.example`):
```
DATABASE_URL               # Postgres connection string
REDIS_URL                  # Redis for Pub/Sub and Socket.io adapter
JWT_ACCESS_SECRET          # Access token signing secret
JWT_REFRESH_SECRET         # Refresh token signing secret
AUDIT_HMAC_SECRET          # HMAC signing secret for audit records (falls back to JWT_ACCESS_SECRET)
PLATFORM_OWNER_MOBILE     # (optional) Bootstrap platform owner user on startup
```

---

## Module Architecture

### 32 Modules — Layered Pattern

Every module follows a strict layered structure. **Controllers stay thin** — all business logic lives in services.

```
Controller (HTTP entry, guards, DTO validation)
  → Service (business logic, transaction boundaries)
    → Repository (TypeORM queries — only here)
    → External provider (wrapped, never called from controllers)
```

**Module directory** (`apps/backend/src/modules/<name>/`):
```
<name>.controller.ts     # Thin — apply guards here
<name>.service.ts        # Business logic lives here
<name>.resolver.ts       # GraphQL resolvers (if module has GraphQL)
dtos/                    # Request/response DTOs
entities/                # TypeORM entities
<name>.module.ts         # Module definition + imports
index.ts                 # Public exports
```

### Module Registry

| # | Module | Purpose | Key service |
|---|--------|---------|-------------|
| 1 | `auth` | JWT/OTP auth, refresh tokens | `AuthService` |
| 2 | `users` | User accounts, profiles | `UsersService` |
| 3 | `rbac` | Roles, permissions | `RbacService` |
| 4 | `accounts` | Trading accounts, cash ledger, positions, withdrawals | `AccountsService` |
| 5 | `oms` | Order lifecycle, risk config, margin engine | `OrderService` |
| 6 | `market` | Instruments, watchlists, price feeds | `InstrumentsService` |
| 7 | `realtime` | Socket.io gateway, Redis adapter | — |
| 8 | `risk-policy` | Margin & risk limits per broker/account | `RiskPolicyService` |
| 9 | `limits-and-controls` | Exposure limits and exceptions | `LimitsAndControlsService` |
| 10 | `execution-gateway` | Order routing to brokers/exchanges | `ExecutionGatewayService` |
| 11 | `notifications` | Email/SMS/push | `NotificationService` |
| 12 | `compliance` | KYC, regulatory, surveillance | `ComplianceService` |
| 13 | `tenancy` | Multi-tenant config, brand settings, domains | `TenancyService` |
| 14 | `onboarding` | Broker/sub-broker/client onboarding | `OnboardingService` |
| 15 | `broker-hierarchy` | IB/sub-broker tree | `BrokerHierarchyService` |
| 16 | `dealing` | Dealer terminal, manual deals | `DealingService` |
| 17 | `promotions` | Campaigns, offers | `PromotionsService` |
| 18 | `reports` | Report definitions | `ReportsService` |
| 19 | `reconciliation` | P&L reconciliation with LP statements | `ReconciliationService` |
| 20 | `settlement` | Trade settlement jobs | `SettlementService` |
| 21 | `partners` | Partner management, payouts | `PartnersService` |
| 22 | `copy-trading` | Copy-trading signals | `CopyTradingService` |
| 23 | `pamm` | PAMM master/slave accounts | `PammService` |
| 24 | `crm` | Outreach, retention offers | `CrmService` |
| 25 | `lp-routing` | Liquidity provider routing | `LpRoutingService` |
| 26 | `rules-engine` | Configurable business rules | `RulesEngineService` |
| 27 | `admin` | Dashboard stats, audit log | `AdminDashboardService` |
| 28 | `saas-control-plane` | Tenant provisioning, entitlements | `SaasControlPlaneService` |
| 29 | `support` | Support tickets | `SupportService` |
| 30 | `demo-accounts` | Demo account provisioning | `DemoAccountService` |
| 31 | `corporate-actions` | Dividends, splits, mergers | `CorporateActionsService` |
| 32 | `developer-platform` | API keys, webhooks | `DeveloperPlatformService` |

---

## Shared Infrastructure Modules

All of these are `@Global()` — available for injection anywhere after `AppModule` wiring. See `src/shared/SHARED_MODULES.md` for full details.

### MessagingModule
Pub/sub via Redis. Inject `IMessagePublisher` to emit domain events. Swap `RedisPublisher` → `KafkaPublisher` in Phase 4 without touching consumers.
- Env: `REDIS_URL` (if absent, publisher is a no-op in dev)

### OutboxModule
Transactional outbox pattern. `append()` to write events atomically with business data; background worker publishes with at-least-once guarantee.
- Table: `outbox` (status: PENDING / PUBLISHED / FAILED)

### AuditModule
Append-only signed audit trail. `AuditService.log()` auto-injects `tenantId`/`actorId`/`requestId` from `getRequestContext()`.
- HMAC secret: `AUDIT_HMAC_SECRET` env var → falls back to `JWT_ACCESS_SECRET` → `'dev-audit-secret'`

### ObservabilityModule
- `GET /health` — DB ping always; Redis ping when `REDIS_URL` set
- `GET /metrics` — Prometheus format at `text/plain; version=0.0.4`

### PlatformTenantSeeder
`OnApplicationBootstrap` provider. Seeds `'platform'` tenant + `platform_owner` role + all `PLATFORM_PERMS` idempotently. Never crashes on failure.

---

## Cross-Module Calling Patterns

**Service-to-service:** Inject the target module's service directly. No intermediate DTOs — pass entities or plain objects.

```ts
// Within the same module's service
constructor(
  private readonly accountsService: AccountsService,
  private readonly omsService: OmsService,
) {}

// Across modules — import the module, inject its service
@Module({
  imports: [AccountsModule, OmsModule],
  ...
})
```

**No cross-module controller calls.** Controllers only receive HTTP input and delegate to their own service.

**TypeORM Repository access from other modules:** Always go through the owning module's service — never inject a repository directly from another module.

---

## Key Conventions

### Logging
```ts
// NEVER console.log / console.error
import { AppLoggerService } from '@/shared/observability/logger.service';
private readonly logger = new AppLoggerService('ModuleName');
logger.log({ requestId }, 'message', { metadata });
```

### Async/Await Only
No `.then()` / `.catch()` chaining. All functions return `Promise<T>`.

### Function Size
Target ~40 lines max. Break at natural seams (validate → transform → persist → respond). Long functions are a smell.

### All Entities Use TypeORM Decorators
```ts
@Entity('table_name')
@Index(['tenantId', 'status'])
export class MyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  tenantId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

### Guards on Controllers
Every controller must have:
- `@UseGuards(TenantGuard)` — injects `tenantId` into request
- `@UseGuards(JwtAuthGuard)` — validates JWT, sets `req.user`

```ts
@Controller('resource')
@UseGuards(TenantGuard, JwtAuthGuard)
export class ResourceController {}
```

### AppModule Wiring Order
Import modules in dependency order (foundation before dependents):
```
TypeOrmModule → ConfigModule → AuthModule → UsersModule → RbacModule → TenancyModule → ...
```

---

## Env Vars Reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `REDIS_URL` | Yes | Pub/Sub + Socket.io adapter |
| `JWT_ACCESS_SECRET` | Yes | Access token signing |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing |
| `AUDIT_HMAC_SECRET` | No | HMAC for audit records (auto-fallback) |
| `PLATFORM_OWNER_MOBILE` | No | Bootstrap platform owner on startup |
| `PLATFORM_OWNER_EMAIL` | No | Email for platform owner |

---

## Adding a New Module

1. Create `src/modules/<name>/` with the layered structure above
2. Add entity with TypeORM decorators and `tenantId` column
3. Create service with business logic (no raw DB access in controllers)
4. Add controller with `@UseGuards(TenantGuard, JwtAuthGuard)` and thin methods
5. Add module class importing its dependencies
6. Wire in `AppModule` — follow the dependency order in the wiring order comment
7. If the module emits domain events, inject `IMessagePublisher` from `MessagingModule`
8. If the module writes audit records, inject `AuditService` from `AuditModule`
9. Update `MODULE_INDEX.md` with the new module entry
10. Run cycle check: `npx madge --circular apps/backend/src`

---

## Timestamps

All timestamps and logs use **IST (Indian Standard Time)**.