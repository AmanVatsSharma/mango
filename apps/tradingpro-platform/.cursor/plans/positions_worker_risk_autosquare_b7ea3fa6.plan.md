---
name: positions_worker_risk_autosquare
overview: Extend the existing server-side `PositionPnLWorker` to also enforce risk + user SL/Target rules, triggering safe, idempotent auto square-offs and keeping `/dashboard` updates smooth via existing SSE + Redis cache.
todos:
  - id: risk-evaluator
    content: Create pure SL/TP + margin-threshold evaluator with unit tests.
    status: completed
  - id: pnl-worker-risk
    content: Extend PositionPnLWorker to evaluate SL/TP + account risk and trigger auto-close, plus heartbeat counters.
    status: completed
  - id: idempotent-close-lock
    content: Add advisory-lock/idempotency to PositionManagementService.closePosition for safe auto-close.
    status: completed
  - id: ui-disable-autoclose
    content: Remove client-side auto-close/reload in use-risk-monitoring hook; keep warnings only.
    status: completed
  - id: docs-sync
    content: Update position module docs + ops notes for new env vars and worker behavior.
    status: completed
isProject: false
---

# Integrate Risk + SL/TP into PositionPnLWorker

## Target behavior

- **StopLoss/Target auto square-off**: when an open position’s live price crosses the user-set `stopLoss` or `target`, the server auto-closes the position.
- **Account risk auto square-off**: when account loss exceeds thresholds (warning/auto-close), the server can close **worst losing positions first** until utilization drops below the auto-close threshold.
- **Immediate close mechanism** (as you selected): auto-close uses the existing position close pathway that creates an **EXECUTED exit order** and updates funds/margin.
- **Smooth dashboard**: keep current Redis PnL cache + SSE patching; position close events propagate via Prisma middleware → realtime emitter → SSE.

## Data flow

```mermaid
flowchart TD
  marketWs[MarketDataWS] --> serverQuoteCache[ServerMarketDataService]
  serverQuoteCache --> pnlWorker[PositionPnLWorker]

  pnlWorker --> redisPnl[Redis_positions_pnl_cache]
  pnlWorker -->|autoSquare| posMgmt[PositionManagementService]

  posMgmt --> postgres[Postgres]
  pnlWorker --> postgres

  postgres --> prismaMw[PrismaRealtimeMiddleware]
  prismaMw --> emitter[RealtimeEventEmitter]
  emitter --> sse[/api/realtime/stream]
  sse --> dashboard[/dashboard]
```



## Implementation plan

- **Add a small, testable risk evaluator (pure logic)**
  - Create `[lib/services/position/position-risk-evaluator.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/position/position-risk-evaluator.ts)` with:
    - `isStopLossHit(quantity,currentPrice,stopLoss)` (long vs short semantics)
    - `isTargetHit(quantity,currentPrice,target)`
    - `computeMarginUtilizationPercent(totalUnrealizedPnL,totalFunds)` using loss-only: `(-min(0,pnl))/funds`
    - `pickRiskAutoClosePositions(positions, thresholds)` (worst-first)
- **Extend `PositionPnLWorker` to evaluate + enforce SL/TP and risk**
  - Update `[lib/services/position/PositionPnLWorker.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/position/PositionPnLWorker.ts)`:
    - Expand the `findMany` selection to include `stopLoss`, `target`, and trading account funds needed for risk:
      - `tradingAccount: { select: { userId: true, balance: true, availableMargin: true } }`
    - While computing PnL, build an in-memory snapshot per position:
      - `{ positionId, tradingAccountId, userId, symbol, quantity, averagePrice, stopLoss, target, currentPrice, unrealizedPnL }`
    - After the PnL loop:
      - Close positions hit by **SL/TP** first (uses current tick `currentPrice` as `exitPriceOverride`).
      - Then run account-level risk:
        - Group by `tradingAccountId`, compute utilization vs thresholds.
        - If `>= autoCloseThreshold`, close losing positions worst-first (bounded per tick to avoid runaway work).
        - If `>= warningThreshold`, create a `RiskAlert` (throttled) but don’t close.
    - Extend the worker heartbeat JSON with counts:
      - `stopLossAutoClosed`, `targetAutoClosed`, `riskAutoClosed`, `riskAlertsCreated`
- **Make auto-close idempotent (prevent double funds/margin side-effects)**
  - Update `[lib/services/position/PositionManagementService.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/position/PositionManagementService.ts)`:
    - Add a **Postgres advisory xact lock** around a position close, similar to `OrderExecutionWorker`.
    - Re-check “still open” under lock; if already closed or lock not acquired, return a safe “no-op/skip” result (worker treats as skipped).
    - Ensure worker always passes `exitPriceOverride` so we **never fetch** `/api/quotes` inside a long-running worker.
- **Avoid double-closing from the browser**
  - Update `[lib/hooks/use-risk-monitoring.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/hooks/use-risk-monitoring.ts)`:
    - Remove the client-side effect that auto-closes a position + `window.location.reload()`.
    - Keep only: riskStatus computation + warning/critical toasts.
- **Docs sync + changelogs**
  - Update:
    - `[lib/services/position/MODULE_DOC.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/position/MODULE_DOC.md)`
    - `[docs/modules/position/MODULE_DOC.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/docs/modules/position/MODULE_DOC.md)`
  - Add runbook/env notes:
    - `RISK_WARNING_THRESHOLD` (default `0.80`)
    - `RISK_AUTO_CLOSE_THRESHOLD` (default `0.90`)
    - Mention: SL/TP enforced by worker tick (`POSITION_PNL_WORKER_INTERVAL_MS`).

## Tests

- Add `tests/position/position-risk-evaluator.test.ts` for SL/TP hit logic and margin-util selection.
- Extend `tests/position/position-pnl-worker.test.ts` to verify:
  - SL/TP hit triggers exactly one close attempt with `exitPriceOverride=currentPrice`.
  - Risk threshold breach triggers worst-first auto-close selection.

## Rollout (EC2)

- Ensure the long-running worker is running (not just cron):
  - `pnpm tsx scripts/position-pnl-worker.ts`
- Set envs:
  - `RISK_WARNING_THRESHOLD=0.80`
  - `RISK_AUTO_CLOSE_THRESHOLD=0.90`
- Restart workers and confirm via Admin Console heartbeat fields and position close events in `/dashboard`.

