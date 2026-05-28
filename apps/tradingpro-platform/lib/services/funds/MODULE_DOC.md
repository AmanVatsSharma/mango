<!--
MODULE_DOC.md
Module: lib/services/funds
Purpose: Fund and margin management service behavior for trading account balance flows.
Last-updated: 2026-02-16
-->

## Overview

This module owns trading-account fund mutations:

- Margin block/release for order lifecycle
- Credit/debit accounting updates
- Transaction-row creation for auditability

Primary implementation:
- `FundManagementService.ts`

## API Consumers

- `POST /api/trading/funds` (manual/admin trading fund operations)
- `OrderExecutionService` and `OrderExecutionWorker` (margin block/release during execution lifecycle)
- `PositionManagementService` (close-position settlement paths)

## Change-log

- **2026-03-31**: `GET /api/admin/transactions`: each row includes **`balanceAfter`** (ledger closing balance after that transaction), computed in PostgreSQL via window sum per `tradingAccountId` with signed effects **CREDIT +amount / DEBIT −amount** vs `trading_accounts.balance` (same convention as user statement). Advanced **TradeManagement** shows type-based green/red amounts and Balance column; CSV adds `SignedAmount` and `BalanceAfter`.
- **2026-03-31**: `GET /api/admin/transactions`: `sortBy` allowlist (`createdAt`, `amount`, `type`, `id`) with 400 on unknown values; `from`/`to` date-only filters interpreted as IST full calendar day (start 00:00 / end 23:59:59.999 Asia/Kolkata). Advanced **TradeManagement** UI exposes full filter parity, debounced user/search, CSV (current page), links to Users + statement deep link (`openStatement=1`).
- **2026-03-09**: Statement transaction descriptions upgraded: `FundManagementService` default description parameters now use explicit fallbacks (e.g. "Margin blocked (no context)", "Debit (no description)") and JSDoc encourages callers to pass detailed descriptions for clear user statements. All callers (OrderExecutionService, OrderExecutionWorker, AdminFundService, AdminUserService, admin positions API) now pass detailed descriptions including amount, refs, and context.
- **2026-02-16**: Repository-level fund summary normalization now uses shared strict finite helper (`repository-number-utils`) in `TransactionRepository`, replacing raw aggregate `Number(...)` coercions for credits/debits/net totals to prevent malformed Decimal aggregates from propagating `NaN` into account transaction summaries.
- **2026-02-16**: `DepositAuditService` now serializes deposit amount fields via strict finite normalization helper when mapping audit records, preventing malformed deposit Decimal values from leaking `NaN` into super-admin deposit audit responses.
- **2026-02-16**: `AdminFundService` now validates persisted deposit/withdrawal/charges/account-margin amounts with strict finite parsing before approval settlement math, and fixes withdrawal null-check ordering before role-scope checks to prevent null dereference on missing withdrawal records.
- **2026-02-16**: `AdminUserService` now uses shared strict finite numeric normalization for deposits/withdrawals/account-balance/user-activity amount calculations and aggregate admin-user metrics, preventing malformed Decimal values from propagating `NaN` into admin user summaries and fund-impact analytics.
- **2026-02-16**: `SuperAdminFinanceService` aggregate amount/charges computations now use shared strict finite normalization for Decimal aggregate serialization (`totalDeposits`, `totalWithdrawals`, `commission`), preventing malformed aggregate values from propagating `NaN` into super-admin finance summaries.
- **2026-02-16**: `/api/admin/deposits` and `/api/admin/withdrawals` now use shared strict request token/identifier/notification-amount normalization helpers, replacing permissive action/id coercion and raw `Number(amount)` notification payload conversion with validated finite amount serialization.
- **2026-02-16**: `/api/admin/users/[userId]/trading-account` now uses shared strict non-negative amount parsers and response-number normalizers, rejecting malformed fund override payload values before admin trading-account balance/margin updates.
- **2026-02-16**: `/api/admin/users` now uses shared strict numeric/date normalization helpers for pagination/date filters and admin user-creation initial-balance parsing, rejecting malformed query/body values before admin user/funds initialization flows.
- **2026-02-16**: `/api/admin/transactions` now uses shared strict numeric/date normalization helpers for pagination, amount/date filters, and PATCH amount reconciliation math, rejecting malformed query/body values before Prisma filtering and reconcile calculations.
- **2026-02-16**: `admin-console/edit-user-dialog` now uses shared strict numeric helpers for trading-account balance/margin validation, fund-impact preview calculations, and "current amount" rendering, preventing malformed numeric text values from causing `NaN`/invalid fund update payloads.
- **2026-02-16**: `admin-console/qr-scanner` manual entry flow now uses shared strict positive amount normalization helper before scan completion callback payload creation, preventing malformed amount text inputs from producing invalid fund-processing payload values.
- **2026-02-16**: `admin-console/create-user-dialog` now uses shared strict optional non-negative amount normalization for initial-balance payload shaping, preventing malformed initial balance inputs from being sent in admin user-creation requests.
- **2026-02-16**: `admin-console/user-statement-dialog` now uses shared strict numeric helpers for trade, ledger, deposit, and withdrawal row amount shaping, preventing malformed numeric values from polluting statement totals and signed transaction amounts.
- **2026-02-16**: `admin-console/fund-management` and `admin-console/add-funds-dialog` now use shared strict amount normalization helpers for API response mapping and add-funds request payload shaping, preventing malformed/non-finite amount values from leaking into admin fund approval flows.
- **2026-02-16**: `admin-console/trade-management` now uses shared strict numeric helpers for pagination parsing, transaction amount mapping, and edit-amount validation, preventing malformed numeric inputs from producing invalid admin transaction update payloads.
- **2026-02-16**: Console deposit/withdraw/statements views now use shared strict numeric normalization helpers for user-entered amount fields and aggregate amount summaries, preventing malformed/non-finite values from leaking into funds UI totals or submission payloads.
- **2026-02-16**: `Account` statement amount rendering now uses shared strict numeric normalization helper before currency formatting, preventing malformed/non-finite transaction amount payloads from surfacing `NaN`/`Infinity` in account fund statement UI.
- **2026-02-16**: `/api/trading/funds` now enforces requested-user scope validation before payload field normalization, ensuring cross-user requests are rejected consistently even when other payload fields are malformed.
- **2026-02-16**: `/api/trading/funds` now normalizes operation-type aliases (`margin-block`, `release_margin`, etc.) into canonical operation commands while preserving explicit invalid-type errors for unsupported values.
- **2026-02-16**: `/api/trading/funds` now rejects non-object request payloads before field extraction, preventing malformed transport bodies from entering funds ownership/amount mutation flow.
- **2026-02-16**: `/api/trading/funds` now normalizes optional `description` payloads (trim, whitespace collapse, length cap) before service calls, preventing oversized/noisy description inputs from polluting fund transaction audit metadata.
- **2026-02-16**: `/api/trading/funds` now applies strict finite-positive amount normalization (including numeric-string support) before invoking fund operations, rejecting non-finite/non-positive payloads to prevent malformed amount values from reaching service mutation paths.
