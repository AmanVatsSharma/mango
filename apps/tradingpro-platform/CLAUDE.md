# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Start development server (Next.js)
npm run build        # Generate Prisma client + build for production
npm run start        # Start production server
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run lint         # ESLint via next lint
```

### Testing
```bash
npm test                                          # Run all tests (Jest)
npm run test:watch                                # Watch mode
npm run test:coverage                             # With coverage report
npm run test:auth                                 # Auth-specific tests only

# Run a single test file
npx jest --config jest.config.cjs path/to/tests/file.test.ts --forceExit

# Run tests matching a pattern
npx jest --config jest.config.cjs --testNamePattern="pattern" --forceExit
```

### Database
```bash
npm run generate          # Generate Prisma client
npm run db:migrate        # Run migrations (dev)
npm run db:push           # Push schema to DB without migration
npm run db:seed           # Seed sample data
npm run db:studio         # Open Prisma Studio
npm run db:reset          # Reset database (destructive)
npm run clean:generated   # Remove generated/ and prisma/generated/
```

### Code Quality
```bash
npm run check:desktop-ux-cycles    # Check circular deps (madge)
npm run check:duplicate-files      # Find duplicate files
npm run check:branding             # Check branding literals
```

## Architecture Overview

### Stack
- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **PostgreSQL** via **Prisma 6** ORM
- **NextAuth.js 5** (beta) for authentication
- **Socket.io** + **Redis (ioredis)** for real-time data
- **Apollo Client** + **GraphQL Yoga** + **Pothos** for GraphQL admin APIs
- **SWR** for client-side data fetching; **RxJS** for reactive market data streams
- **Zod** for validation; **React Hook Form** for forms; **Radix UI** for primitives

### Workspace Scope

**Work happens ONLY in `tradingpro-platform/` and its 3 branches (`main`, `stocktrade`, `tradebazar`). Never touch `TradeBazaar/` or `electron-app/` or `webview-app/` during feature development.**

- `tradingpro-platform/` — primary (all feature work, all branches)
- `TradeBazaar/` — Docker deployment mirror — synced **after** work is done, never during
- `electron-app/` / `webview-app/` — client shells loading the hosted app as URL — never edited

### Directory Structure

```
app/          # Next.js App Router: pages and API route handlers
components/   # React UI components (217 files)
lib/          # All business logic, organized by domain module
  admin/      # Admin user management, KYC, audit
  auth/       # Authentication, session security, MPIN/OTP
  console/    # Real-time trading terminal
  market-data/# Quote caching, Vortex/Stocksocket integration
  rbac/       # Role-based access control (USER/ADMIN/MODERATOR/SUPER_ADMIN)
  redis/      # Redis client and pub/sub
  repositories/# Data access layer (abstraction over Prisma)
  risk/       # Margin calculation, position limits, risk config
  services/   # Orchestration services (order execution, funds, analytics)
actions/      # Next.js server actions (auth, mobile-auth)
hooks/        # Custom React hooks
prisma/       # Schema, migrations, seed scripts
tests/        # 181 Jest test files mirroring lib/ structure
services/     # Terminal gateway and external service integrations
```

### API Design Pattern
- **REST** (`app/api/`) for transactional endpoints: orders, auth, funds, KYC, risk
- **GraphQL** (`app/api/graphql`) for admin dashboards, analytics, and flexible data reads
- **WebSocket** via Socket.io for streaming real-time market data and console events
- High-frequency endpoints (orders, fills) use REST to minimize latency

### Layered Architecture
```
API Route / Server Action
    → Service (lib/services/) — orchestration, business logic
        → Repository (lib/repositories/) — DB access via Prisma
        → External Provider (lib/market-data/, lib/services/) — wrapped in provider class
```
Controllers stay thin; services own business logic; repositories own DB logic. No cross-layer shortcuts.

### Test Structure
Tests live in `tests/` and mirror the `lib/` structure. The Jest config uses `testEnvironment: "node"`, resolves `@/` path alias to the repo root, and sets up global mocks for NextAuth, Next.js navigation, and AWS in `tests/setup.ts`. Set `VERBOSE_TESTS=true` to see suppressed console output.

### Key Conventions (from .cursor/rules/)
- **No `console.log`** — use the Pino logger from `lib/logger.ts`; always attach `requestId` for correlation
- **Async/await only** — never `.then()` chaining
- **Functions max ~40 lines** — keep them small and composable
- **REST vs GraphQL**: REST for transactional (orders, auth), GraphQL for aggregation (dashboards, reporting)
- **Domain errors** extend `AppError` (code + message); mapped to HTTP status codes in an exception filter
- All files should start with a JSDoc file header: `@file`, `@module`, `@description`
- Mark TODOs with `[SonuRamTODO]` for easy grep
- All timestamps and logs use **IST (Indian Standard Time)**
- After editing a module, update its `MODULE_DOC.md` and the root `CHANGELOG.md`
- Check for circular deps with `npm run check:desktop-ux-cycles` when adding cross-module imports

### Real-Time Architecture
Market data flows: Vortex/Stocksocket → Redis pub/sub → Socket.io → client hooks (`useMarketData`, etc.). The console module (`lib/console/`) manages the terminal session lifecycle with its own WebSocket namespace.

### Adding a New Prisma Model
1. Define in `prisma/schema.prisma`
2. `npm run db:migrate` (dev) or `npm run db:push` (quick iteration)
3. GraphQL CRUD for the model is auto-generated via Pothos (`generated/autocrud.ts`) after `npm run generate`

### Multi-Repository Sync

**Every** multi-repo change must be synced to all branches immediately after the commit. The repos are:
- `tradingpro-platform/` — primary (all feature work happens here)
- `TradeBazaar/` — Docker deployment mirror (copy of `tradingpro-platform/` with `Dockerfile` + `docker-compose.prod.yml`)

**Branches in `tradingpro-platform/`:** `stocktrade`, `tradebazar`, `main` — all must be in sync after any multi-file change.

**Sync procedure (run after every meaningful commit):**
```bash
# 1. Mirror changed files to TradeBazaar
TP="$PWD"
TB="/path/to/TradeBazaar"
cp -r <changed files> "$TB/<same paths>"
cd "$TB" && git add <files> && git commit -m "mirror(<scope>): <same message> [from tradingpro-platform]" && git push

# 2. Cherry-pick to all 3 branches if on a different branch than target
git checkout stocktrade && git cherry-pick <commit-sha> && git push origin stocktrade
git checkout main     && git cherry-pick <commit-sha> && git push origin main
git checkout tradebazar  # return to default
```

**Rule:** never leave one branch ahead of others after a feature or fix commit. Use `git ls-tree origin/<branch> -- <file>` to verify sync before declaring work complete.

## Production Deployment

### EC2 Server (StockTrade — EC2 Mumbai, ap-south-1)

| Field | Value |
|-------|-------|
| Host | `ec2-3-108-94-216.ap-south-1.compute.amazonaws.com` |
| User | `ubuntu` |
| Key | `~/Desktop/Key_Pairs/Mumbai_Key_pair.pem` |

**Quick connect:**
```bash
ssh -i "~/Desktop/Key_Pairs/Mumbai_Key_pair.pem" ubuntu@ec2-3-108-94-216.ap-south-1.compute.amazonaws.com

# Or add to ~/.ssh/config as "stocktrade" host, then simply:
ssh stocktrade
```

### PM2 Commands (on EC2)
```bash
pm2 list                              # Show all processes
pm2 logs stocktrade-web                # Web app logs
pm2 logs stocktrade-order-worker      # Order worker logs
pm2 logs stocktrade-position-pnl-worker # PnL worker logs
pm2 restart all                        # Restart all processes
pm2 save                               # Save current process list
pm2 monit                              # Real-time monitoring
```

### Deploy Procedure
```bash
# 1. Upload updated ecosystem config from local docs/infra/
scp -i "~/Desktop/Key_Pairs/Mumbai_Key_pair.pem" \
  docs/infra/ecosystem-stocktrade.config.cjs \
  ubuntu@ec2-3-108-94-216.ap-south-1.compute.amazonaws.com:/home/ubuntu/stocktrade/

# 2. SSH in and restart
ssh stocktrade
cd /home/ubuntu/stocktrade
pm2 delete stocktrade-web
pm2 start ecosystem-stocktrade.config.cjs --only stocktrade-web
pm2 save
```

### Server Specs
- **Instance:** t3.medium (2 vCPU, 4GB RAM base)
- **Swap:** 4GB added via `/swapfile` (fallocate + swapon)
- **Web clusters:** 3 × `stocktrade-web` in cluster mode (800M memory limit each)
- **Workers:** 1 × `stocktrade-order-worker` (750ms interval) + 1 × `stocktrade-position-pnl-worker` (3000ms interval)
- **Port:** 4000

## Reference Documentation
Key architecture docs in the repo root:
- `TRADING_SYSTEM_ARCHITECTURE.md` — full system design
- `VORTEX_INTEGRATION.md` — broker API integration
- `WEBSOCKET_SETUP_GUIDE.md` — real-time setup
- `AUTH_QUICK_REFERENCE.md` — authentication flows
- `LOGGING_GUIDE.md` — Pino logging setup
- `docs/modules/` — per-module documentation


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
