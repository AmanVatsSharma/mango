---
name: unify_admin_risk_+_workers_backstop
overview: Make risk management enterprise-grade by making `PositionPnLWorker` the primary server-side enforcer (SL/TP + account loss thresholds), with the existing “Risk Monitoring” worker repurposed as a backstop that only runs when the positions worker is stale. Store thresholds in SystemSettings (admin-editable) with env fallback, and surface everything coherently across Admin Console Workers + Risk tabs.
todos:
  - id: risk-thresholds-systemsettings
    content: Add SystemSettings-backed risk thresholds helper (env fallback) + tests.
    status: completed
  - id: pnl-worker-thresholds
    content: Update PositionPnLWorker to read thresholds from SystemSettings helper (cached), and surface in heartbeat if useful.
    status: completed
  - id: risk-backstop-runner
    content: Implement runRiskBackstop() and use it from cron + admin run-once + admin risk/monitor endpoint (skip if PnL worker healthy).
    status: completed
  - id: admin-ui-consolidation
    content: Update Admin Console Workers tab to show new risk counters; update Risk Management tab to edit thresholds + run unified backstop.
    status: in_progress
  - id: docs-sync-risk
    content: Update workers + admin-console docs explaining new backstop architecture and config keys.
    status: pending
isProject: false
---

# Unify Risk Management (PositionsWorker primary, RiskMonitoring backstop)

## What exists today (duplication)

- **Workers tab** (`components/admin-console/workers.tsx`) shows **Risk Monitoring** and can “Run now”. This calls `RiskMonitoringService.monitorAllAccounts()` via `POST /api/admin/workers`.
- **Risk Management tab** (`components/admin-console/risk-management.tsx`) has a **Server-Side Risk Monitoring** panel that calls `POST /api/admin/risk/monitor` (also runs `RiskMonitoringService.monitorAllAccounts()`), with optional per-run thresholds.
- **Positions worker** (`lib/services/position/PositionPnLWorker.ts`) already computes live PnL and (now) also enforces **SL/Target + risk thresholds** and can auto square-off.

Result: two separate server-side risk executors (cron/admin) + one inside the positions worker.

## Target end-state (your selected direction)

- **Canonical enforcement**: `PositionPnLWorker` enforces SL/TP + account loss thresholds continuously.
- **Backstop only**: “Risk Monitoring” cron/admin-run is a **backstop** that runs only when the positions worker heartbeat is **stale**.
- **Config source**: thresholds live in **SystemSettings** (admin-editable), with env fallback.
- **Admin Console clarity**:
  - Workers tab shows risk counters from the positions worker heartbeat.
  - Risk tab manages thresholds + shows alerts/limits/config; “Run now” triggers the same backstop runner.

## Architecture sketch

```mermaid
flowchart TD
  thresholds[SystemSettings_risk_thresholds] --> pnlWorker[PositionPnLWorker]
  pnlWorker --> db[(Postgres)]
  pnlWorker --> redis[(Redis_cache+pubsub)]
  db --> sse[/api/realtime/stream]
  sse --> dashboard[/dashboard]

  riskBackstop[RiskMonitoring_backstop_cron] -->|only_if_pnl_stale| pnlWorker
```



## Plan

- **A) Add SystemSettings-backed risk thresholds (with env fallback)**
  - Add keys + helpers:
    - `risk_warning_threshold`
    - `risk_auto_close_threshold`
  - Implement a small helper module (cache 30–60s in-memory) to read/validate/normalize values (accept `0..1` or `0..100`).
  - Likely files:
    - `[lib/server/workers/system-settings.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/server/workers/system-settings.ts)` (reuse existing helpers)
    - New: `[lib/services/risk/risk-thresholds.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/risk/risk-thresholds.ts)`
- **B) Wire thresholds into `PositionPnLWorker**`
  - Replace direct env usage (`RISK_WARNING_THRESHOLD`, `RISK_AUTO_CLOSE_THRESHOLD`) with the SystemSettings helper.
  - Add thresholds into the worker heartbeat for observability (optional but useful).
  - File:
    - `[lib/services/position/PositionPnLWorker.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/position/PositionPnLWorker.ts)`
- **C) Repurpose “Risk Monitoring” into a backstop runner**
  - Implement `runRiskBackstop()` that:
    - Reads `positions_pnl_worker_heartbeat` and TTL (same logic as worker registry health).
    - If positions worker is **healthy** → **skip** and write a risk heartbeat with `skippedReason=positions_worker_healthy`.
    - If stale/unknown → run a **full risk scan** by invoking the positions worker in “backstop mode” (e.g. higher batch size / allow more closes per account), then write heartbeat.
  - Update entrypoints to use `runRiskBackstop()`:
    - `[app/api/cron/risk-monitoring/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/cron/risk-monitoring/route.ts)`
    - `[app/api/admin/workers/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/workers/route.ts)` (run-once)
    - `[app/api/admin/risk/monitor/route.ts](/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/admin/risk/monitor/route.ts)` (Risk tab “run now”)
  - Outcome: **only one executor** closes positions (the positions worker), while “risk monitoring” becomes orchestration/backstop.
- **D) Admin Console consolidation**
  - Workers tab (`components/admin-console/workers.tsx`):
    - Show new heartbeat counters from `PositionPnLWorker`:
      - `stopLossAutoClosed`, `targetAutoClosed`, `riskAutoClosed`, `riskAlertsCreated`
    - Rename/clarify risk monitoring card as “Risk Backstop (cron)” and display skip reason.
  - Risk Management tab (`components/admin-console/risk-management.tsx`):
    - Add a **Thresholds** section backed by SystemSettings (GET/PUT).
    - “Run now” should call the unified backstop endpoint (not a separate implementation).
- **E) Optional hardening (recommended)**
  - Add a pagination/time-budget strategy to ensure the positions worker scan covers all open positions at scale (avoid `take=500` missing older opens).
  - Replace remaining `console.*` in risk-related server paths with structured logger.

## Tests

- Unit tests for threshold parsing + SystemSettings fallback.
- Backstop behavior tests:
  - skips when positions worker heartbeat is fresh
  - runs when stale and updates heartbeat

## Docs

- Update worker docs to explain “backstop” semantics:
  - `[lib/server/workers/MODULE_DOC.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/server/workers/MODULE_DOC.md)`
  - `[docs/modules/workers/MODULE_DOC.md](/home/amansharma/Desktop/DevOPS/tradingpro-platform/docs/modules/workers/MODULE_DOC.md)`
- Update admin-console docs to reflect new threshold source + run-now behavior.

