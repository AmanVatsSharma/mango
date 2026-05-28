# Enterprise Trading Platform Checklist

Legend: `[x] done` `[~] partial` `[ ] pending`

## Platform Foundation
- [x] Structured Pino logging with request correlation
- [x] Global exception filter with domain error mapping
- [x] Request context middleware and tenant header propagation
- [~] WebSocket correlation context propagation (baseline present; deeper tracing pending)
- [x] Health + metrics endpoints

## Identity & Access
- [x] OTP auth + JWT access/refresh rotation
- [x] TOTP 2FA
- [x] Session revoke/list (self + admin)
- [x] RBAC roles/permissions with tenant guard
- [ ] API keys / HMAC client auth

## Trading Core (OMS + Accounts)
- [x] Order place/modify/cancel + execution ingest
- [x] Idempotency on orders/executions/ledger writes
- [x] Advisory-lock concurrency for account-critical writes
- [x] Margin estimate + brokerage + user leverage overrides
- [~] Exchange adapters (interface complete, real provider integration pending)
- [~] Settlement lifecycle automation (T+X and reconciliation pending)

## Funds & Statements
- [x] Deposit request + admin approve/reject
- [x] Withdrawal request + admin approve/reject
- [x] Bank-account linking model
- [~] Real bank verification and payment rails integration pending
- [~] Statement generation/export baseline exists; institutional reporting depth pending

## Market Data & Realtime
- [x] Instruments/exchanges/watchlists
- [x] Snapshot + SSE quote delivery
- [x] Unified websocket stream for watchlist/orders/positions/accounts
- [x] Main/vortex/mock market-data adapters with polling baseline
- [~] Advanced failover/circuit-breaker policy pending

## Notifications
- [x] Notification entities + preferences
- [x] Notification template rendering and persistence
- [~] External channel providers (SES/SNS/FCM) pending

## Engineering Governance
- [x] Canonical Nx app layout (`apps/backend`, `apps/web`, `apps/web-e2e`)
- [x] Executor-based Nx project targets (build/lint/test/e2e)
- [x] Domain project boundaries and tags
- [x] Cycle and duplicate checks in scripts
- [x] CI workflow for affected lint/test/build + quality checks
- [x] Rules and docs synced: `.cursor/rules/` (master, security-api, data-persistence, observability-resilience, testing-quality, etc.) and root `docs/` + `README.md` per standards plan

## Global Broker SaaS Scaffold (Wave-1)
- [x] Trader web route-group scaffold (`onboarding`, `portfolio`, `orders`, `funds`, `settings`)
- [x] Broker-admin and platform-owner app shells
- [x] Tenancy and broker-hierarchy control-plane module scaffolds
- [x] Execution gateway with five connector families and contract tests
- [x] Compliance, onboarding, and risk-policy scaffolds
- [x] Settlement, reconciliation, corporate-actions, limits-and-controls scaffolds
- [x] SaaS control-plane scaffolds (provisioning, entitlements, billing placeholders, support audit)
- [~] Production integrations pending (real exchange, payment rails, compliance providers)

## Global Broker SaaS Scaffold (Wave-2)
- [x] Added new client surfaces: mobile, dealer workstation, support-ops, IB portal, developer portal, public site, desktop-pro
- [x] Added shared client libs: mobile-ui-kit/mobile-auth/mobile-api-client/web-shell/desktop-shell
- [x] Added backend modules: dealing, support, partners, developer-platform
- [x] Added baseline security guards on new controllers (JWT + Tenant + Permissions)
- [x] Added audit-hook stubs for dealing overrides, support impersonation, partner payout approvals, and webhook registration
- [x] Added shared scale scaffolds: messaging, outbox, resilience wrappers, cache contracts, realtime scale coordinator
- [x] Added AWS baseline scaffolds: Terraform module skeletons and Helm charts
- [~] Mobile runtime stack is placeholder (Expo-style scaffold only; full native pipeline pending)
- [~] Desktop runtime stack is placeholder (Electron/Tauri packaging pending)

## Next Institutional Milestones
- [ ] Real exchange routing + lifecycle reconciliation
- [~] Compliance automation baseline scaffolded (KYC/AML/sanctions/audit retention providers pending)
- [ ] Multi-region HA + tested DR
- [ ] Queue-backed fanout/event bus for extreme-load scaling
