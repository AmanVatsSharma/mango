# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace Overview

This is an **Nx monorepo** with 5 apps and shared libraries. The workspace is the "Mango" orchestrator at the root, with real code distributed across the `apps/` directory.

```
apps/
  backend/          — NestJS REST/GraphQL API (32 modules: auth, oms, market, etc.)
  broker-admin/     — Next.js broker admin console (port 4500)
  frontend/         — Next.js trading platform frontend (port 3000)
  tradingpro-mobile — Mobile trading app
  tradingpro-platform — Legacy Next.js trading platform (standalone, NOT part of this workspace)

libs/
  shared/
    types/          — Shared TypeScript interfaces (ApiResponse, MarketTick, etc.)
    utils/          — Shared utilities (formatCurrency, formatDate, debounce, etc.)
```

**Important:** `apps/tradingpro-platform/` is a **standalone Nx workspace** inside this directory — it has its own `package.json`, `node_modules`, and `CLAUDE.md`. Do NOT mix it with the current workspace. Development commands here operate only on `apps/backend`, `apps/broker-admin`, `apps/frontend`, and `apps/tradingpro-mobile`.

**Type sharing warning:** `libs/shared/types/src/index.ts` defines canonical domain enums (`OrderStatus`, `OrderSide`, `OrderType`, etc.). The `frontend/` app has **local duplicates** at `lib/hooks/types/realtime-trading.types.ts` — they are NOT in sync. Do NOT assume they match. Always use the shared types.

**Important:** `apps/tradingpro-platform/` is a **standalone Nx workspace** inside this directory — it has its own `package.json`, `node_modules`, and `CLAUDE.md`. Do NOT mix it with the current workspace. Development commands here operate only on `apps/backend`, `apps/broker-admin`, `apps/frontend`, and `apps/tradingpro-mobile`.

---

## Commands

### Workspace-wide (from repo root)

```bash
# Run all apps / all libs
npm run build      # Build everything
npm run dev        # Dev all apps
npm run lint       # Lint all apps
npm run test       # Test all apps

# Type check
npm run type-check

# Nx
npx nx graph                      # Visual dependency graph
npx nx reset                      # Clear Nx daemon cache
npx nx build backend              # Build one app
npx nx affected --target=build    # Build only affected
```

### App-specific

```bash
# Frontend (Next.js 14 trading platform — apps/frontend)
npm run dev:frontend      # nx run frontend:dev (port 3000)

# Database (tradingpro-platform workspace — separate db)
npm run db:push            # cd apps/tradingpro-platform && npx prisma db push
npm run db:migrate
npm run db:seed
npm run db:studio
```

---

## Architecture

### Backend — NestJS Module Map

Modules in `apps/backend/src/modules/` (32 total):

| Module | Purpose |
|--------|---------|
| `accounts` | Trading accounts |
| `admin` | Platform administration |
| `auth` | JWT/passport authentication |
| `broker-hierarchy` | IB/sub-broker tree |
| `compliance` | KYC, regulatory |
| `copy-trading` | Copy trade engine |
| `corporate-actions` | Corporate actions handling |
| `crm` | Customer relationship |
| `dealing` | Dealer terminal |
| `demo-accounts` | Demo/paper trading |
| `developer-platform` | Developer APIs |
| `execution-gateway` | Broker/exchange connectivity |
| `limits-and-controls` | Exposure limits |
| `lp-routing` | Liquidity provider routing |
| `market` | Market data feeds |
| `notifications` | Email/SMS/push |
| `oms` | Order Management System |
| `onboarding` | Broker/sub-broker onboarding |
| `pamm` | PAMM (managed accounts) |
| `partners` | Partner management |
| `promotions` | Campaigns |
| `rbac` | Role-based access control |
| `realtime` | Prana-stream WebSocket |
| `reconciliation` | P&L reconciliation |
| `reports` | Reporting/analytics |
| `risk-policy` | Margin & risk limits |
| `rules-engine` | Configurable rule engine |
| `saas-control-plane` | Multi-tenant SaaS |
| `settlement` | Trade settlement |
| `support` | Support/ticketing |
| `tenancy` | Tenant management |
| `users` | User management |

**Layered architecture per module:**
```
Controller (thin)
  → Service (business logic)
    → Repository (TypeORM/Prisma)
    → External provider (wrapped in a provider class)
```

Controllers stay thin. Never shortcut across layers.

### Shared Libraries

**`libs/shared/types/src/index.ts`** — the canonical home for cross-app TypeScript types:
- `ApiResponse<T>`, `PaginatedResponse<T>` — standard response wrappers
- `UserRole`, `OrderSide`, `OrderType`, `OrderStatus` — domain enums
- `MarketTick` — real-time quote shape

**All apps import shared types via path alias:**
```ts
import { ApiResponse, MarketTick } from '@mango/shared-types'
```

### API Design

- **REST** — transactional endpoints (orders, auth, accounts)
- **GraphQL** (via NestJS + Pothos) — admin dashboards, analytics, flexible reads
- **WebSocket** (Socket.io + Redis adapter) — real-time market data and console events

### Path Aliases

All aliases resolve from repo root. Key ones:
```
@mango/shared-types  → libs/shared/types/src/index.ts
@mango/shared-utils  → libs/shared/utils/src/index.ts
@obsidian/backend-* → apps/backend/src/modules/*/index.ts
@app/shared-types   → libs/shared/types/src/index.ts   (alternate)
@app/shared-utils    → libs/shared/utils/src/index.ts   (alternate)
```

---

## Key Patterns

### No `console.log` — use Pino logger

```ts
import { logger } from '@/app/shared' // or path to logger
logger.info({ requestId }, 'message', { metadata })
```

### Async/await only — never `.then()` chaining

### Functions max ~40 lines — keep them composable

### TypeScript

- `strict: true`, `strictNullChecks: false` — nulls must be handled explicitly
- `noImplicitAny: false` — some `any` is allowed; don't fight it
- Use **Zod** for runtime validation, `class-validator` for DTOs

### Timestamps

All timestamps and logs use **IST (Indian Standard Time)**.

---

## Issue Tracking (bd/beads)

This project uses **bd** for issue tracking. Run `bd prime` for full workflow.

```bash
bd ready              # Find available work
bd show <id>         # View issue
bd update <id> --claim
bd close <id>
bd dolt push          # Push to remote
```

**Rules:**
- Use `bd` for ALL task tracking — never TodoWrite or markdown lists
- Work is NOT complete until `git push` succeeds
- Non-interactive shell: use `cp -f`, `rm -f`, `mv -f` to avoid hanging prompts

---

## Development Conventions

- **File headers** — Every `.ts` file should have a JSDoc header (file, module, purpose, exports, depends on, side-effects)
- **TODOs** — mark with `[YourNameTODO]` for traceability
- **Multi-repo sync** — if code touches `apps/tradingpro-platform/`, it must be synced to all branches per that app's CLAUDE.md multi-repo sync section
- **Cycle check** — run `npx madge --circular apps/backend/src` before adding cross-module imports in the backend