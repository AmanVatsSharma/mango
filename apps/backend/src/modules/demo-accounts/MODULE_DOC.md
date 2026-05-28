---
title: Demo Accounts Module
created: 2026-03-15
maintainer: BharatERP
---

## Purpose
Support demo (paper) trading accounts: create demo accounts with optional virtual balance seed, list demo accounts for the current user. Demo orders are routed through a simulated execution adapter in OMS and never hit the real execution gateway. Real deposits and withdrawals are rejected for demo accounts.

## Files
- demo-accounts.module.ts — Nest module
- controllers/demo-accounts.controller.ts — POST/GET /demo-accounts
- services/demo-account.service.ts — createDemoAccount, listDemoAccounts
- dtos/create-demo-account.dto.ts — optional baseCurrency, seedBalanceCcy, seedAmount
- MODULE_DOC.md — this file
- index.ts — re-exports

## APIs
- POST /demo-accounts — create demo account (optional seed balance); requires accounts:write
- GET /demo-accounts — list my demo accounts; requires accounts:read

## Dependencies
- AccountsModule (AccountsService, LedgerService for seeding)
- SharedModule, RbacModule (guards)

## Flow
1. Client calls POST /demo-accounts with optional seedAmount/seedBalanceCcy.
2. DemoAccountService creates account via AccountsService with accountType: 'DEMO', then optionally posts a single cash credit (kind: adjustment) to the new account.
3. OMS OrderService resolves account type by accountId; for DEMO accounts it uses DemoExchangeAdapter (simulated accept); for LIVE accounts it uses the real execution gateway.
4. Deposits and withdrawals for DEMO accounts are rejected with DEMO_ACCOUNT_OPERATION (403).

## Changelog
- 2026-03-15: Initial module; create/list demo accounts with optional seed; OMS routing and deposit/withdrawal guards in accounts module.
