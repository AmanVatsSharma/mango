# Module: risk

**Short:** Core risk services for margin checks, account risk monitoring, and risk-triggered actions with backstop execution paths.

**Purpose:** Continuously evaluate account and position risk, calculate margin requirements, and trigger protective actions before losses cascade. This module also owns canonical risk threshold storage and backstop runners used when the long-running positions worker needs an operator/cron fallback.

**Files:**
- `MarginCalculator.ts` — Margin and charge estimation plus account margin validation.
- `RiskMonitoringService.ts` — Periodic account-level monitoring and auto-close flow.
- `RiskMonitoringJob.ts` — Worker wrapper with overlap safety and threshold/env normalization.
- `RiskEventMonitor.ts` — Event-driven trigger path for account risk checks.
- `RiskMonitoringIntegration.ts` — Integration glue for risk monitoring orchestration.
- `risk-number-utils.ts` — Shared finite-number parsing and threshold normalization helpers.
- `risk-thresholds.ts` — Canonical threshold read/write via SystemSettings with env fallback.
- `trading-policies.ts` — Legacy single-policy helpers (negative-PnL close delay compatibility keys).
- `dynamic-trading-policies.ts` — Dynamic multi-policy engine (condition catalog, CRUD validation, runtime evaluator).
- `risk-config-normalizer.ts` — Canonical segment/product alias normalization for risk-config lookups (incl. BSE, F&O option vs future product keys); segment/product allow-lists for admin validation.
- `risk-config-instrument-kind.ts` — Read-only **Kind** labels for admin UI (Equity / Commodity / Futures / Options / F&O shared / Other) from `(segment, productType)`.
- `risk-config-resolve-active.ts` — Single active-row resolver used by admin coverage preview (same precedence as `MarginCalculator` / public config API).
- `risk-config-admin-audit.ts` — Best-effort `TradingLog` rows on RiskConfig create/update (internal audit).
- `risk-config-defaults.ts` — Shared default leverage/brokerage/margin-rate fraction helpers for `MarginCalculator` and `/api/risk/config`.
- `risk-backstop-runner.ts` — Backstop runner that triggers `PositionPnLWorker` when needed.
- `MODULE_DOC.md` — this file.

**Flow diagram:** `flowcharts/risk-flow.svg`

**Dependencies:**
- Prisma (`tradingAccount`, `position`, `riskAlert`, `riskConfig`, `stock` tables)
- `PositionManagementService`
- `PositionRepository`
- Worker lock helpers for overlap safety

**APIs:**
- Internal service APIs consumed by worker routes and jobs.
- Admin/Cron endpoints use this module for threshold updates and run-once backstop triggers.
- Public `GET /api/risk/config?segment=&productType=&optionType=` — margin/brokerage preview; `optionType` `CE`/`PE` steers F&O toward `NRML_OPT` candidates; omitting it steers toward `NRML_FUT`.
- Admin `GET /api/admin/risk/coverage` — requires `admin.risk.read`; returns fixed sample matrix of label → resolved active `RiskConfig` (smoke / operator clarity).
- Admin `GET /api/admin/risk/exposure-preview` — requires `admin.risk.read`; read-only loss-utilization preview vs canonical thresholds (DB LTP; see main `docs/RISK_MANAGEMENT_SYSTEM.md`).
- Admin `POST/PUT /api/admin/risk/config` — optional body fields validated against segment/product allow-lists derived from the normalizer.

**Env vars:**
- `RISK_WARNING_THRESHOLD`
- `RISK_AUTO_CLOSE_THRESHOLD`
- `RISK_MAX_REDUCTION_ROUNDS_PER_TICK` — positions PnL worker: max risk close→recompute rounds per account per tick (default 20).
- `RISK_MONITORING_LOCK_TTL_MS`

**SystemSettings keys:**
- `risk_warning_threshold`
- `risk_auto_close_threshold`

**Tests:** risk unit tests cover lock behavior, threshold parsing, numeric normalization helpers, instrument-kind derivation, F&O candidate ordering, and `GET /api/risk/config` precedence.

## Operator matrix (watchlist-aligned)

Align platform `RiskConfig` rows with how instruments appear in the watchlist: **options** carry `optionType` (`CE` / `PE`); **futures** do not.

| Segment | Product keys (typical) | Resolver behavior |
|--------|-------------------------|-------------------|
| NSE | `MIS`, `CNC` (and aliases) | Equity-like; no F&O split. |
| BSE | `MIS`, `CNC` | Equity-like. |
| NFO, BSE_FO, MCX | `NRML` | Shared default row for both fut and opt until split rows exist. |
| Same | `NRML_FUT` | Tried first when **no** `optionType` on a derivative segment (futures path). |
| Same | `NRML_OPT` | Tried first when `optionType` is `CE` or `PE` (options path). |

**Migration / seed:** `20260328200000_risk_config_fut_opt_mcx` idempotently adds optional `NRML_FUT` / `NRML_OPT` for NFO and MCX (and baseline MCX `NRML` if missing). NSE/BSE `MIS`/`CNC` baselines remain as in earlier migrations.

**Governance:** Admin Risk Management UI shows **Kind**, **Margin rate**, filters, F&O guide text, and **Resolution preview** (coverage endpoint). Create/update audit via `TradingLog` where configured.

## Change-log
- 2026-04-01 (IST): **Parity: tradingpro-platform & TradeBazaar** — Unified **loss-only utilization** in `RiskMonitoringService` with `PositionPnLWorker` (`computeMarginUtilizationPercent`). Cron monitor mode and admin risk worker runs use **`getRiskThresholds()`**. `RiskEventMonitor` loads canonical thresholds each check. PnL worker **multi-round** risk reduction + admin **exposure-preview** API and Risk Management UI copy. See `lib/services/risk/MODULE_DOC.md` and `docs/RISK_MANAGEMENT_SYSTEM.md`.
- 2026-03-28 (IST, enterprise control): Admin Risk Management: Kind column, margin rate in table, segment/product/active/F&O filters, F&O guide, resolution preview via `GET /api/admin/risk/coverage`. `risk-config-instrument-kind`, `risk-config-resolve-active`, allow-list validation on admin RiskConfig POST/PUT, TradingLog audit on create/update, idempotent seed migration `20260328200000_risk_config_fut_opt_mcx`, tests for kind + normalizer precedence + public `GET /api/risk/config`.
- 2026-03-28 (IST): Centralized risk fallbacks in `risk-config-defaults.ts`; `MarginCalculator` now honors `RiskConfig.marginRate` (percent or 0–1 fraction, capped at 100% notional) when set, else leverage. Extended segment aliases (BSE/BSE_EQ/BSE_FO) and F&O product resolution (`NRML_OPT` / `NRML_FUT`) with optional `optionType` on lookups. Public `GET /api/risk/config` accepts `optionType` and returns `marginRate`. Settings admin brokerage editor removed in favor of read-only snapshot + Risk Management link; `lib/server/order-execution` `placeOrder` delegates to `OrderExecutionService`.
- 2026-02-17: Extended `ORDER_PLACE` dynamic policy catalog with side/LTP-aware fields (`order.side`, `order.orderType`, `order.ltp`, `order.priceOffsetFromLtp`, `order.priceOffsetFromLtpPercent`) so admins can enforce segment-scoped buy-above/sell-below LTP policies.
- 2026-02-17: Extended dynamic policy context catalog for `POSITION_CLOSE` with lot/partial-exit fields (`position.lotSize`, `position.requestedCloseQuantity`, `position.requestedCloseLots`, `position.remainingQuantityAfterClose`) so admins can define advanced square-off constraints.
- 2026-02-17: Added `dynamic-trading-policies.ts` with a robust multi-policy engine (priority, ALL/ANY matching, typed operators, dynamic condition catalog, runtime evaluator), while preserving legacy `negative_pnl_close_delay` compatibility as a read-only policy source.
- 2026-02-17: Added `trading-policies.ts` to persist/evaluate admin trading policies (including negative-PnL close delay) via `SystemSettings`, and integrated this policy into user close-position API enforcement.
- 2026-02-17: Added `risk-config-normalizer.ts` and updated `MarginCalculator` + `/api/risk/config` to resolve segment/product aliases consistently (e.g., `CNC`/`DELIVERY`, `NFO`/`FNO`) so admin leverage config is honored in order placement preview/execution.
- 2026-02-16: `lib/services/risk/risk-number-utils.ts` now delegates finite parsing to shared market-data strict numeric parser, ensuring risk threshold/value normalization remains behaviorally consistent with token/quote parsing utilities.
- 2026-02-16: Public risk-config preview API (`/api/risk/config`) now uses shared strict finite numeric serializer for leverage/brokerage fields, avoiding permissive decimal coercion when shaping client-facing risk preview payloads.
- 2026-02-16: `/api/admin/users/[userId]/risk-limit` now uses shared strict risk numeric parsers for user limit update payloads and response serialization, including leverage-multiplier derived max-leverage calculation using validated finite base leverage values.
- 2026-02-16: Admin risk config/limits routes (`/api/admin/risk/config`, `/api/admin/risk/config/[id]`, `/api/admin/risk/limits`, `/api/admin/risk/limits/[id]`) now use shared strict numeric normalization helpers for decimal/integer fields, enum/boolean guards, and output serialization, preventing malformed admin payload values from reaching Prisma decimal writes.
- 2026-02-16: `admin-console/user-quick-actions` risk-limit dialog input parsing now uses shared strict finite numeric helper with explicit invalid-value sentinel handling, replacing direct `Number(...)` coercion in admin quick-risk update payload shaping.
- 2026-02-16: `admin-console/edit-user-dialog` leverage-override multiplier field now uses shared strict finite input normalization helper, preventing malformed numeric text values from entering leverage override save payload state.
- 2026-02-16: `admin-console/risk-management` now uses shared strict numeric helpers for monitoring threshold controls and platform/user risk config input fields, replacing permissive `parseFloat/parseInt` coercion to prevent malformed numeric text values from contaminating risk payloads.
- 2026-02-16: `RiskMonitor` threshold input controls now use shared strict percent-normalization helper (finite parsing + 0..100 clamping) to prevent malformed text-entry values from propagating into warning/auto-close client threshold state.
- 2026-02-16: `use-risk-monitoring` now resolves live quote prices through shared token-first quote helpers (`resolveQuoteFromMap` + `resolveDisplayPriceFromQuote`) so risk calculations use consistent websocket display/ltp fallback semantics instead of direct `last_trade_price` checks.
- 2026-02-16: Shared `risk-number-utils` parser now treats `null`/`undefined` as missing values (not `0`) so nullable numeric payloads in risk services retain deterministic fallback behavior.
- 2026-02-16: Updated `RiskMonitoringJob` to reuse shared `parseFiniteRiskNumber` helper for environment and threshold parsing so worker/job normalization behavior stays consistent across risk services.
- 2026-02-16: Hardened `RiskEventMonitor` to normalize threshold overrides and validate account/user payloads (trim + non-empty guards) before scheduling debounced checks or immediate checks, preventing malformed trigger inputs from reaching monitoring workflows.
- 2026-02-16: Exposed `RiskMonitoringService.monitorAccount` for event-driven checks and now normalize threshold pairs at method entry, ensuring direct monitor calls remain safe even with malformed threshold payloads.
- 2026-02-16: Added `risk-number-utils` shared helpers to strictly parse finite numeric values, safely reject non-coercible inputs (including Symbols), normalize non-negative values, and normalize warning/auto-close threshold pairs with safe clamping.
- 2026-02-16: Updated `MarginCalculator` and `RiskMonitoringService` to use strict numeric parsing for leverage, brokerage, account balances, quote LTP, and average price values so malformed numeric inputs degrade safely without crashes.
- 2026-02-13 (IST): Added SystemSettings-backed risk thresholds helper (`risk-thresholds.ts`).
- 2026-02-13 (IST): Added backstop runner (`risk-backstop-runner.ts`) and repurposed risk-monitoring run-now flows to use it.

