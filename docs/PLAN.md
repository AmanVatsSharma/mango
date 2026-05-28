# Documentation Plan — Mango Workspace

**Status:** Complete — all P0 items delivered 2026-05-23
**Last-updated:** 2026-05-23

---

## 1. Documentation Hierarchy

```
Root CLAUDE.md
  ├── apps/backend/CLAUDE.md          (if exists — create next)
  ├── apps/backend/MODULE_INDEX.md    ← this plan creates
  ├── apps/backend/src/modules/*/MODULE_DOC.md  (one per module — missing most)
  │
  ├── libs/shared/TYPES.md            ← this plan creates
  │
  ├── apps/broker-admin/APP_OVERVIEW.md ← this plan creates
  ├── apps/broker-admin/MODULE_DOC.md  (exists — covers app-level)
  │
  ├── apps/frontend/APP_OVERVIEW.md    ← this plan creates
  │   └── apps/frontend/lib/services/*/MODULE_DOC.md  (partially exists)
  │
  └── apps/tradingpro-platform/CLAUDE.md  (standalone — separate workspace, own docs)
      └── apps/tradingpro-platform/docs/modules/*/MODULE_DOC.md  (10 docs exist here)
```

**Rule:** Canonical location for each topic lives in exactly one place. No duplication.

---

## 2. All Existing Documentation

### Root level
| Path | Type | Topic |
|------|------|-------|
| `CLAUDE.md` | GUIDE/SETUP | Workspace overview, commands, architecture, patterns |

### apps/backend
| Path | Type | Topic |
|------|------|-------|
| `README.md` | GUIDE | Backend overview |
| `audit.md` | REFERENCE | Audit notes |
| `src/modules/*/index.ts` | REFERENCE | Module public APIs (35 modules) |

### apps/broker-admin
| Path | Type | Topic |
|------|------|-------|
| `MODULE_DOC.md` | MODULE | App purpose, auth, API wiring, env vars |
| `next.config.js` | REFERENCE | Build config, proxy rules |

### apps/frontend
| Path | Type | Topic |
|------|------|-------|
| `lib/services/console/MODULE_DOC.md` | MODULE | Console data layer |
| `lib/services/realtime/MODULE_DOC.md` | MODULE | Realtime hooks |
| `components/console/MODULE_DOC.md` | MODULE | Console UI components |
| `components/trading/DOCS.md` | MODULE | Trading dashboard docs |
| `lib/services/admin/MODULE_DOC.md` | MODULE | Admin data hooks |
| `lib/services/analytics/MODULE_DOC.md` | MODULE | Analytics |
| `lib/services/market-data/MODULE_DOC.md` | MODULE | Market data |
| `lib/services/notifications/MODULE_DOC.md` | MODULE | Notifications |
| `lib/services/order/MODULE_DOC.md` | MODULE | Order service |
| `lib/services/position/MODULE_DOC.md` | MODULE | Position tracking |

### apps/tradingpro-platform (STANDALONE — separate workspace)
| Path | Type | Topic |
|------|------|-------|
| `CLAUDE.md` | GUIDE/SETUP | Platform overview |
| `AGENTS.md` | GUIDE | Agent responsibilities |
| `README.md` | GUIDE | Platform readme |
| `AUTH_QUICK_REFERENCE.md` | REFERENCE | Auth patterns |
| `CLIENT_API_GUIDE.md` | API | Client API |
| `WEBSOCKET_SETUP_GUIDE.md` | GUIDE | WebSocket setup |
| `LOGGING_GUIDE.md` | GUIDE | Logging |
| `TRADING_SYSTEM_ARCHITECTURE.md` | ARCHITECTURE | Trading system design |
| `ADMIN_CONSOLE_SETUP.md` | GUIDE | Admin console setup |
| `CHANGELOG.md` | REFERENCE | Changelog |
| `FEATURE_ROADMAP.md` | REFERENCE | Roadmap |
| `🎉_MAINTENANCE_MODE_COMPLETE.md` | REFERENCE | Feature notes |
| `🔧_HARDCODED_MAINTENANCE_MODE_COMPLETE.md` | REFERENCE | Feature notes |
| `NOTIFICATION_FIX_COMPLETE.md` | REFERENCE | Feature notes |
| `MAINTENANCE_MODE_IMPLEMENTATION_COMPLETE.md` | REFERENCE | Feature notes |
| `IST_TIMEZONE_QUICK_GUIDE.md` | GUIDE | IST timezone |
| `QUICK_REFERENCE_REALTIME_HOOKS.md` | REFERENCE | Realtime hooks |
| `SMS_SETUP_GUIDE.md` | GUIDE | SMS setup |
| `MOBILE_AUTH_SETUP.md` | GUIDE | Mobile auth |
| `WATCHLIST_QUICK_REFERENCE.md` | REFERENCE | Watchlist |
| `milli-search-frontend.md` | REFERENCE | Search integration |
| `docs/modules/risk/MODULE_DOC.md` | MODULE | Risk module |
| `docs/modules/workers/MODULE_DOC.md` | MODULE | Workers module |
| `docs/modules/admin-console/MODULE_DOC.md` | MODULE | Admin console |
| `docs/modules/common-errors/MODULE_DOC.md` | MODULE | Common errors |
| `docs/modules/funds/MODULE_DOC.md` | MODULE | Funds |
| `docs/modules/order/MODULE_DOC.md` | MODULE | Order |
| `docs/modules/position/MODULE_DOC.md` | MODULE | Position |
| `docs/modules/rbac/MODULE_DOC.md` | MODULE | RBAC |
| `docs/modules/realtime/MODULE_DOC.md` | MODULE | Realtime |
| `docs/modules/redis/MODULE_DOC.md` | MODULE | Redis |
| `components/lib/**/MODULE_DOC.md` | MODULE | (scattered) |
| `scripts/**/MODULE_DOC.md` | MODULE | (scattered) |
| `docs/modules/**/MODULE_DOC.md` | MODULE | (scattered) |

---

## 3. Canonical Locations by Topic

| Topic | Canonical Location |
|-------|---------------------|
| Workspace overview + commands | `CLAUDE.md` (root) |
| Backend module map | `apps/backend/MODULE_INDEX.md` (this plan → creates) |
| Backend auth | `apps/backend/src/modules/auth/index.ts` |
| Backend OMS | `apps/backend/src/modules/oms/index.ts` |
| Backend RBAC | `apps/backend/src/modules/rbac/index.ts` |
| Backend broker hierarchy | `apps/backend/src/modules/broker-hierarchy/index.ts` |
| Shared types | `libs/shared/types/src/index.ts` |
| Shared types guide | `libs/shared/TYPES.md` (this plan → creates) |
| broker-admin overview | `apps/broker-admin/APP_OVERVIEW.md` (this plan → creates) |
| broker-admin module doc | `apps/broker-admin/MODULE_DOC.md` (exists) |
| frontend overview | `apps/frontend/APP_OVERVIEW.md` (this plan → creates) |
| frontend service docs | `apps/frontend/lib/services/*/MODULE_DOC.md` (10 exist) |
| tradingpro-platform docs | Inside `apps/tradingpro-platform/` (standalone, own CLAUDE.md) |

---

## 4. What's Missing

### P0 — Must Have (critical gaps) ✅ ALL DELIVERED 2026-05-23

| # | Document | Location | Status |
|---|----------|----------|--------|
| 1 | Backend MODULE_INDEX.md | `apps/backend/MODULE_INDEX.md` | ✅ Done (9.2KB) |
| 2 | Shared types guide | `libs/shared/TYPES.md` | ✅ Done (6.8KB) |
| 3 | broker-admin APP_OVERVIEW.md | `apps/broker-admin/APP_OVERVIEW.md` | ✅ Done (8.6KB) |
| 4 | frontend APP_OVERVIEW.md | `apps/frontend/APP_OVERVIEW.md` | ✅ Done (9.6KB) |
| 5 | API design doc | `apps/backend/API.md` | ✅ Done (9.9KB) |
| 6 | Authentication flow doc | `apps/backend/AUTH_FLOW.md` | ✅ Done (9.5KB) |
| 7 | Realtime architecture doc | `apps/backend/REALTIME.md` | ✅ Done (13KB) |

### P1 — Should Have ✅ ALL DELIVERED 2026-05-23

| # | Document | Location | Status |
|---|----------|----------|--------|
| 8 | Backend CLAUDE.md | `apps/backend/CLAUDE.md` | ✅ Done (9.5KB) |
| 9 | Frontend CLAUDE.md | `apps/frontend/CLAUDE.md` | ✅ Done (6.8KB) |
| 10 | broker-admin CLAUDE.md | `apps/broker-admin/CLAUDE.md` | ✅ Done (7.7KB) |
| 11–20 | Backend MODULE_DOC expansions | `src/modules/*/MODULE_DOC.md` | ✅ 20 modules expanded (partials + stubs) |
| — | SHARED_MODULES.md | `src/shared/SHARED_MODULES.md` | ✅ Created (7.1KB) |
| — | Stale audit fixes | `docs/AUDIT_REPORT.md` | ✅ Updated |
| — | Root CLAUDE.md fixes | `CLAUDE.md` (root) | ✅ Fixed dev:frontend, module count, type warnings |
| — | Type mismatch warnings | frontend + broker-admin type files | ✅ Warning comments added |
| — | Frontend README.md | `apps/frontend/README.md` | ✅ Created (5.9KB) |
| — | broker-admin README.md | `apps/broker-admin/README.md` | ✅ Created (9.1KB) |

### P2 — Nice to Have (future work)

| # | Document | Location | Why Missing |
|---|----------|----------|-------------|
| 21 | Deployment guide | `docs/DEPLOYMENT.md` | No deployment docs |
| 22 | Database schema doc | `apps/backend/SCHEMA.md` | ORM entities not documented |
| 23 | Testing strategy doc | `docs/TESTING.md` | No testing approach documented |
| 24 | Contributing guide | `CONTRIBUTING.md` | No contribution guidelines |
| 25 | Module doc: onboarding | `apps/backend/src/modules/onboarding/MODULE_DOC.md` | Onboarding flow not documented |
| 26 | Module doc: compliance | `apps/backend/src/modules/compliance/MODULE_DOC.md` | KYC/regulatory not documented |
| 27 | Module doc: settlement | `src/modules/settlement/MODULE_DOC.md` | ✅ Done (stub expanded) |
| 28 | Module doc: reconciliation | `src/modules/reconciliation/MODULE_DOC.md` | ✅ Done (stub expanded) |
| 29 | Module doc: reports | `src/modules/reports/MODULE_DOC.md` | ✅ Done (basic) |
| 30 | Module doc: copy-trading | `src/modules/copy-trading/MODULE_DOC.md` | ✅ Done (partial expanded + dep graph) |
| 31 | Module doc: pamm | `src/modules/pamm/MODULE_DOC.md` | ✅ Done (partial expanded + dep graph) |
| 32 | Frontend service: risk | `lib/services/risk/MODULE_DOC.md` | ⬜ Not done |
| 33 | Frontend service: websocket | `lib/services/websocket/MODULE_DOC.md` | ⬜ Not done |
| 34 | Frontend service: security | `lib/services/security/MODULE_DOC.md` | ⬜ Not done |

---

## 5. Documentation Types Defined

| Type suffix | Meaning |
|-------------|---------|
| `CLAUDE.md` | AI guidance — rules, patterns, commands for Claude Code |
| `MODULE_DOC.md` | Code module documentation — purpose, entities, APIs, dependencies |
| `APP_OVERVIEW.md` | App-level doc — tech stack, routes, API boundary, how to run |
| `TYPES.md` | Type catalog — full listing of shared types with usage guide |
| `MODULE_INDEX.md` | Module registry — all modules with purpose, entities, owners |
| `API.md` | API reference — REST/GraphQL/WebSocket endpoints |
| `*_GUIDE.md` | Tutorial/how-to — step-by-step for a specific task |
| `*_REFERENCE.md` | Quick reference — command cheatsheet, config reference |
| `ARCHITECTURE.md` | System design — component relationships, data flows |

---

## 6. Documentation Plan for This Session

**This plan creates 5 documents** (all other docs are future work):

1. `docs/PLAN.md` — this file — master plan, canonical locations, priority ranking
2. `apps/backend/MODULE_INDEX.md` — all 32 backend modules indexed
3. `libs/shared/TYPES.md` — shared types catalog with usage guide
4. `apps/broker-admin/APP_OVERVIEW.md` — broker-admin app doc
5. `apps/frontend/APP_OVERVIEW.md` — frontend app doc

**Ownership rule:** Once this plan is merged, each new module doc is the responsibility of whoever implements that module.