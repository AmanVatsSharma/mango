# Obsidian Backend Audit Report (MT5 Competition Context)

**Generated:** 2026-02-17
**Scope:** Backend implementation status after Nx enterprise restructuring + critical hardening
**Assumption:** Live market data is served by a separate external API (`MARKET_DATA_URL`), not owned by this backend codebase.

> **Note:** This audit is historical (generated 2026-02-17). Some information may be stale. Cross-reference `MODULE_DOC.md` files in each module directory for current state.

---

## Executive Snapshot

- Overall backend readiness for an MT5-style broker platform: **~82%**
- Strongest areas: **auth/session security**, **multi-tenant RBAC**, **ledger/idempotency/concurrency**, **OMS core flows**, **realtime delivery rails**
- Biggest production gaps: **real exchange integration**, **settlement lifecycle**, **notification channel providers**, **institutional compliance automation**

---

## What Is Done Already

### 1) Identity, Access, and Security
- OTP login with AWS SNS + JWT access/refresh rotation
- TOTP 2FA enable/verify/disable
- Session listing and revocation (self + admin)
- Tenant + permissions guards across admin and trading surfaces
- Structured error mapping via `AppError` + global exception filter

### 2) Users + RBAC
- User profile + enterprise user fields (kyc, tax, aml markers, etc.)
- Admin users CRUD + deactivate/reactivate
- Role/permission CRUD and user-role grant
- Permission guard and tenant guard in critical controllers

### 3) Accounts, Ledgers, and Funds Core
- Multi-account per user and per tenant
- Cash ledger + hold/release + position ledger with idempotency keys
- Advisory locks (`pg_advisory_xact_lock`) in critical posting paths
- Deposit request + admin approve/reject flows
- Withdrawal request + admin approve/reject flows
- Statement list + export (csv/pdf baseline available)

### 4) OMS, Risk, and Positions
- Order place/modify/cancel endpoints with adapter abstraction
- Execution ingest path with idempotency and ledger posting
- Margin engine + brokerage/user-overrides/risk-rule admin APIs
- Position aggregation and streaming endpoints
- Order audit entity + admin audit read endpoint

### 5) Market + Realtime
- Instruments/exchanges/watchlists APIs
- Snapshot + subscribe/unsubscribe quote APIs
- SSE + unified Socket.IO stream (`/ws/prana`)
- Composite market-data adapter (main/vortex/mock)
- Realtime scale coordinator (DB-backed snapshots for orders/positions/accounts in realtime aggregator)

### 6) Observability
- `/health` endpoint (DB + Redis)
- `/metrics` endpoint with Prometheus integration
- RequestId and tenant correlation in logger context
- HTTP logging interceptor

---

## What Is Partial / Still Stubbed

1. **Exchange adapter realism (critical)**
   - `apps/backend/src/modules/oms/adapters/exchange-adapter.ts`
   - Current adapters simulate accepted/cancelled outcomes; no live OMS reconciliation.

2. **Notifications provider integrations**
   - `apps/backend/src/modules/notifications/services/notification.service.ts`
   - Persistence + preference filtering exists, but SES/SNS/FCM are still stub-level.

3. **Advanced risk/execution rules**
   - `apps/backend/src/modules/oms/services/margin-engine.service.ts`
   - Placeholder-style percentages remain for some products; lacks exchange-grade rule parity.

4. **Realtime failover sophistication**
   - Main/vortex adapters now poll live APIs, but full circuit-breaker/backoff policy is still minimal.

---

## Top Production Blockers

1. Real exchange connectivity + order-state reconciliation
2. Notification channel providers (email/SMS/push) wired to real services
3. Broker-grade pre-trade validations (lot size, tick size, trading windows, product constraints)
4. Compliance workflows (KYC/AML orchestration, sanction screening, retention/export policies)
5. Disaster recovery playbooks and HA deployment topology  

---

## Domain Completion Matrix

| Domain | Completion |
|---|---:|
| Auth & Session Security | 96% |
| Users + RBAC | 92% |
| Accounts + Ledger | 88% |
| OMS Core | 85% |
| Market + Watchlists | 86% |
| Realtime Platform | 83% |
| Notifications | 82% |
| Admin Analytics & Ops | 70% |
| Observability/SRE | 68% |

**Overall:** **~82%**

---

## Roadmap to MT5-Level Competition

### Wave 1 (MVP-Production Trading)
- Implement real exchange adapters and reconciliation workers
- Harden order validation matrix (symbol restrictions, lot/tick, hours, product policy)
- Wire notification providers for operational events and user alerts
- Add settlement hooks for funds + positions close lifecycle

### Wave 2 (Scale + Reliability)
- Add robust circuit-breakers/retries and queue-backed fanout
- Introduce cached read models for heavy portfolio and dashboard reads
- Expand admin analytics (AUM, turnover, risk exposure, conversion funnels)
- Formalize runbooks/alerts/SLO dashboards

### Wave 3 (Institutional Readiness)
- Compliance automation for KYC/AML and data-governance mandates
- Immutable audit/event trails with stronger legal traceability
- Multi-region resilience patterns + tested disaster recovery drills

---

## Change Log

- 2026-02-17: Refreshed report after enterprise Nx restructuring and critical backend hardening implementation.
