<!--
MODULE_DOC.md
Module: lib/services/risk
Purpose: Risk thresholds + monitoring + backstop utilities.
Last-updated: 2026-04-08 (min margin per lot)
-->

## Overview

This module provides server-side risk configuration and monitoring services used by workers, admin controls, and scheduled backstop flows.

Key responsibilities:

- Canonical threshold storage via `SystemSettings` with environment fallback.
- Account and position risk monitoring and alert creation.
- Backstop execution path used by admin/cron flows when continuous workers need recovery support.

## Canonical enforcement path

- **Primary enforcer**: `lib/services/position/PositionPnLWorker.ts`
  - Enforces per-position StopLoss/Target.
  - Enforces account-level loss-utilization thresholds.
- **Backstop runner**: `runRiskBackstop(...)`
  - Checks position worker heartbeat and skips when healthy unless forced.
  - Invokes `positionPnLWorker.processPositionPnL({ forceRun: true, ... })` when needed.

## Threshold storage

Global `SystemSettings` keys:

- `risk_warning_threshold`
- `risk_auto_close_threshold`

Environment fallback:

- `RISK_WARNING_THRESHOLD`
- `RISK_AUTO_CLOSE_THRESHOLD`
- `RISK_MONITORING_LOCK_TTL_MS`

## Files

- `risk-thresholds.ts` — read/write thresholds (SystemSettings + env fallback, cached).
- `trading-policies.ts` — legacy single-policy helpers (negative-PnL close delay compatibility keys).
- `dynamic-trading-policies.ts` — dynamic multi-policy engine (condition catalog, CRUD validation, runtime evaluator).
- `risk-config-normalizer.ts` — canonical segment/product alias normalization + admin allow-lists (incl. `NRML_OPT_BUY` / `NRML_OPT_SELL` / `MIS_OPT_*`).
- `risk-margin-side.ts` — maps placement / offset / net-position context to margin risk side for option row selection.
- `risk-config-instrument-kind.ts` — admin UI Kind labels from `(segment, productType)`.
- `risk-config-resolve-active.ts` — active-row resolver for coverage preview.
- `risk-config-pick-active.ts` — single precedence walk (`pickActiveRiskConfigRow`) shared by calculator, public risk API, and resolver.
- `risk-required-margin.ts` — `computeBaseRequiredMarginFromTurnover` + `applyShortOptionMinMarginPerLotFloor` (CE/PE + SELL); shared by `MarginCalculator` and order-form preview.
- `risk-config-admin-audit.ts` — TradingLog on RiskConfig create/update.
- `risk-backstop-runner.ts` — conditional backstop trigger for the positions worker.
- `RiskMonitoringService.ts` — account-level monitoring and alerting.
- `RiskMonitoringJob.ts` — scheduled/loop runner with overlap safety.
- `RiskMonitoringIntegration.ts` — orchestration glue.
- `RiskEventMonitor.ts` — event-triggered monitoring entry points.
- `risk-number-utils.ts` — strict finite parsing and threshold normalization.
- `MODULE_DOC.md` — this file.

## Changelog

- 2026-04-08 (IST): **Short option minimum margin per lot** — Prisma `RiskConfig.minMarginPerLot` (nullable INR/lot). Applied only for listed options (CE/PE) with margin side SELL: `requiredMargin = max(base, ceil(lots × minMarginPerLot))`. Wired in `MarginCalculator`, `GET /api/risk/config`, admin risk config CRUD + audit, `resolveActiveRiskConfigForInstrument` + coverage preview, `use-order-form` + `order-form-normalization`. Migration `20260408180000_risk_config_min_margin_per_lot`. Tests: `risk-required-margin.test.ts`, extended `margin-calculator-asymmetric-options`, `risk-config-route.test.ts`, `order-form-normalization.test.ts`. **TradeBazaar** parity.
- 2026-04-08 (IST): **Follow-up — DRY + tests + observability** — `pickActiveRiskConfigRow` extracted; `MarginCalculator` verbose logs gated behind `MARGIN_CALC_DEBUG=1|true`; Jest: `risk-config-pick-active.test.ts`, `margin-calculator-asymmetric-options.test.ts`, position close asserts `marginRiskSide` on release; removed dead client margin helpers from `use-trading-data.ts`; admin coverage adds MIS option SELL sample. Mirror TradeBazaar.
- 2026-04-08 (IST): **Indian option margin split (Phase 1)** — New RiskConfig product types `NRML_OPT_BUY`, `NRML_OPT_SELL`, `MIS_OPT_BUY`, `MIS_OPT_SELL`; `resolveRiskConfigProductTypeCandidatesForInstrument(..., marginRiskSide)`; `MarginCalculator` accepts `instrument.marginRiskSide` (default: placement `orderSide`). Public `GET /api/risk/config` supports `orderSide` when `optionType` is CE/PE. `resolveActiveRiskConfigForInstrument` + admin coverage samples extended. Migration `20260408120000_risk_config_opt_buy_sell` (idempotent NFO/MCX seeds). Files: `risk-margin-side.ts`, `MarginCalculator.ts`, `risk-config-instrument-kind.ts`, tests under `tests/services` / `tests/api`.
- 2026-04-06 (IST): **Default loss-utilization thresholds** — warning **75%**, auto-close **80%** (`risk-thresholds.ts`, `RiskMonitoringService`, `RiskMonitoringJob`, `RiskEventMonitor`, `PositionPnLWorker` fallback, admin risk UI initial state, `use-risk-monitoring`, `RiskMonitor` fallbacks). Exported `DEFAULT_RISK_UTILIZATION_THRESHOLDS`. Tests: `risk-monitoring-service-auto-close.test.ts`, extended `position-risk-evaluator` / `risk-thresholds` / worker risk scenario.
- 2026-04-01 (IST): **Enforcement policy** — `risk-enforcement-settings.ts` + `GET/PUT /api/admin/risk/enforcement-settings`: **full liquidation on auto-close** (all losing positions per wave in `PositionPnLWorker`) and **square off on warning band** (optional aggressive mode; aligns `RiskMonitoringService` + worker). `POST /api/admin/risk/liquidate-account` for admin **Close losers / Close all** from Risk Management exposure table. Env: `RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE`, `RISK_SQUARE_OFF_ON_WARNING`. Worker heartbeat adds `riskFullLiquidation` / `riskSquareOffOnWarning`.

- 2026-04-01 (IST): **Single loss-utilization formula** — `RiskMonitoringService` now uses `computeMarginUtilizationPercent` (loss-only: `max(0,-netUnrealizedPnL)/totalFunds`) to match `PositionPnLWorker` / `position-risk-evaluator`. Cron (`/api/cron/risk-monitoring` monitor mode) and admin worker **risk_monitoring** run pass **`getRiskThresholds()`** so SystemSettings thresholds match admin UI. `RiskEventMonitor` loads canonical thresholds each debounced/manual check. **Position PnL worker** risk stage runs **bounded multi-round** reduction (`RISK_MAX_REDUCTION_ROUNDS_PER_TICK`, default 20; per-run `riskMaxReductionRoundsPerTick`; default **3** closes/round) until utilization drops or caps hit. **Admin** `GET /api/admin/risk/exposure-preview` + Risk Management UI tooltips for warning vs auto-close and backstop force-run. `RiskMonitoringService` uses `TradingLogger` (removed console spam at module load).
- 2026-03-30 (IST): `dynamic-trading-policies` **POSITION_CLOSE** catalog adds `position.isIntraday` (number 1/0) for intraday vs carryforward presets; retail `POST /api/trading/positions` policy snapshot passes numeric flag (not boolean/null).
- 2026-03-28 (IST): Parity with TradeBazaar enterprise risk control: admin Risk Management Kind/margin/filters/coverage preview; `GET /api/admin/risk/coverage`; admin RiskConfig allow-list validation + audit helper; migration `20260328200000_risk_config_fut_opt_mcx`; unit/API tests under `tests/services` and `tests/api/risk-config-route.test.ts`. Full operator matrix: `TradeBazaar/docs/modules/risk/MODULE_DOC.md`.
- 2026-02-17: Extended `ORDER_PLACE` dynamic policy catalog with side/LTP-aware fields (`order.side`, `order.orderType`, `order.ltp`, `order.priceOffsetFromLtp`, `order.priceOffsetFromLtpPercent`) so admins can enforce segment-specific buy-above/sell-below LTP policies.
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

