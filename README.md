# Mango — Multi-Broker SaaS Trading Platform

> A full-stack Nx monorepo powering broker-dealer operations, trading dashboards, and client-facing mobile apps.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![NestJS](https://img.shields.io/badge/NestJS-10-red)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Nx](https://img.shields.io/badge/Nx-20-gray)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Architecture

```
mango/
├── apps/
│   ├── backend/           # NestJS REST/GraphQL/Socket.io API
│   ├── frontend/          # Next.js trading platform (port 3000)
│   ├── broker-admin/      # Next.js broker admin console (port 4500)
│   ├── tradingpro-mobile/ # Mobile trading app (Next.js)
│   └── tradingpro-platform/ # Legacy standalone trading platform
└── libs/
    └── shared/            # Shared TypeScript types & utilities
```

## Apps

| App | Framework | Purpose |
|-----|------------|---------|
| **backend** | NestJS | REST/GraphQL/Socket.io API — auth, OMS, market data, compliance, PAMM, copy-trading |
| **frontend** | Next.js 14 | Trading platform dashboard for end clients |
| **broker-admin** | Next.js | Admin console for broker/sub-broker management |
| **tradingpro-mobile** | Next.js | Mobile-responsive trading client |
| **tradingpro-platform** | Next.js | Legacy standalone trading platform (standalone Nx workspace) |

## Modules (Backend — 32 modules)

`accounts` · `admin` · `auth` · `broker-hierarchy` · `compliance` · `copy-trading` · `corporate-actions` · `crm` · `dealing` · `demo-accounts` · `developer-platform` · `execution-gateway` · `limits-and-controls` · `lp-routing` · `market` · `notifications` · `oms` · `onboarding` · `pamm` · `partners` · `promotions` · `rbac` · `realtime` · `reconciliation` · `reports` · `risk-policy` · `rules-engine` · `saas-control-plane` · `settlement` · `support` · `tenancy` · `users`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ |
| Backend | NestJS 10 · TypeORM · PostgreSQL |
| Frontend | Next.js 14 · React 18 · Tailwind CSS |
| Auth | Passport JWT · TOTP 2FA |
| Real-time | Socket.io · Redis adapter |
| API | REST · GraphQL (Pothos) |
| Monorepo | Nx 20 |
| Validation | Zod · class-validator |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Redis 7+

### Install

```bash
# Install dependencies
npm install

# Type check all apps
npm run type-check

# Build all apps
npm run build
```

### Development

```bash
# Start all apps in dev mode
npm run dev

# Or start individual apps
npm run dev:frontend    # Trading platform (port 3000)
npm run dev:backend     # NestJS API
```

### Workspace Commands

```bash
npx nx graph                      # Visual dependency graph
npx nx affected --target=build    # Build only affected apps
npx nx reset                      # Clear Nx daemon cache

# Database (tradingpro-platform workspace)
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
```

## API Design

- **REST** — transactional endpoints (orders, auth, accounts)
- **GraphQL** (via NestJS + Pothos) — admin dashboards, analytics, flexible reads
- **WebSocket** (Socket.io + Redis adapter) — real-time market data and console events

## Project Structure

### Backend (Layered Architecture)

```
apps/backend/src/modules/<module>/
├── controller.ts    # Thin — routes, DTO validation
├── service.ts       # Business logic
├── repository.ts    # TypeORM data access
└── provider.ts      # External provider wrapper
```

### Shared Libraries

Types and utilities shared across all apps:

```typescript
// Path alias: @mango/shared-types
import { ApiResponse, MarketTick, OrderStatus } from '@mango/shared-types'
```

## License

MIT