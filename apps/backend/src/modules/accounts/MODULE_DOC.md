---
title: Accounts & Balances Module
created: 2025-09-19
maintainer: BharatERP
---

## Purpose
Manages trading accounts, cash/position ledgers, balances, statements, holds, withdrawal approvals, and buying power rules. Multi-tenant, multi-account per user, multi-currency with future FX conversion.

## Entities
- AccountEntity (includes accountType: LIVE | DEMO; default LIVE)
- CashLedgerEntryEntity
- PositionLedgerEntryEntity
- HoldEntity
- DailyStatementEntity
- BuyingPowerRuleEntity
- WithdrawalRequestEntity

## APIs
- POST /accounts — create
- GET /accounts — list my
- GET /accounts/:id — details
- POST /accounts/:id/disable — disable account
- POST /accounts/:id/enable — enable account
- POST /accounts/bank-accounts — link bank account
- GET /accounts/bank-accounts — list linked bank accounts
- POST /accounts/deposits — create deposit request
- GET /accounts/deposits — list my deposits
- GET /admin/accounts/deposits — list tenant deposits (admin)
- POST /admin/accounts/deposits/:id/approve — approve and credit deposit
- POST /admin/accounts/deposits/:id/reject — reject deposit
- POST /accounts/:id/ledger/cash — post cash
- POST /accounts/:id/ledger/hold — create hold
- POST /accounts/:id/ledger/release — release hold
- GET /accounts/:id/ledger — list ledger
- GET /accounts/:id/balances — balances & buying power
- GET /accounts/:id/statements — daily statements
- GET /accounts/:id/statements/:date/download?format=pdf|csv — download statement
- POST /accounts/:id/withdrawals — request withdrawal (approval required)
- POST /accounts/:id/withdrawals/:wid/approve — approve
- POST /accounts/:id/withdrawals/:wid/reject — reject

## GraphQL (accounts.resolver.ts)
- Query myAccounts — list accounts for current user (accounts:read)
- Query account(id) — get account by UUID (accounts:read)
- Query allAccounts(userId?) — admin list by tenant (accounts:read)
- Query accountBalance(accountId, currency?) — cash/equity/buying-power (accounts:read)
- Mutation createAccount — create account (accounts:write)
- Mutation disableAccount(id) — disable account (accounts:write)
- Mutation enableAccount(id) — enable account (accounts:write)

## Security
JWT required; Tenant header enforced; RBAC permissions: accounts:read|write, ledger:read|write, statements:read

## Error Handling
Uses AppError and GlobalHttpExceptionFilter.

## Concurrency & Idempotency
Per-account advisory locks; unique externalRefId for idempotent postings.

## Buying Power Rules
Moved to OMS module. Accounts now queries OMS `RiskConfigService` for multipliers and margin rates.

## EOD Statements
IST by default; per-account timezone preference to be respected later.

## Changelog
- 2025-09-19: Initial scaffold with entities, controllers, services, docs.
- 2025-09-19: Added FxService integration and moved buying power rules to OMS.
- 2025-09-24 IST: Added TenantGuard to all controllers; disable/enable endpoints with Swagger
- 2025-01-09 IST: Added bank accounts linking/listing, deposit requests with admin approval, and entities/migrations; enhanced EOD statements computation (cash flows, MTM)
- 2026-02-17 IST: Realtime account/position publish now prefers request-context userId routing (fallback to accountId), and module registered as Nx domain library boundary.
- 2026-03-15: Added accountType (LIVE | DEMO) to AccountEntity and CreateAccountDto; listByUserAndType; reject deposits and withdrawals for DEMO accounts (DemoAccountOperationError).
- 2026-05-19: Added accounts.resolver.ts — GraphQL Query/Mutation surface mirroring REST endpoints; accounts.index.ts barrel exports AccountsResolver.


