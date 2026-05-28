---
name: admin_workers_management_tab
overview: Create a dedicated Admin Console “Workers” page that lists every background worker (order execution, position PnL, risk monitoring), shows health via heartbeats, allows enable/disable + run-now actions, and documents which worker processes/cron jobs to run on EC2 vs Vercel.
todos:
  - id: inventory-worker-registry
    content: Create worker registry + SystemSettings keys + health logic under `lib/server/workers/`.
    status: completed
  - id: worker-heartbeats
    content: Add/standardize heartbeats for order worker + risk monitoring; keep position pnl heartbeat.
    status: completed
  - id: admin-workers-api
    content: Implement `app/api/admin/workers/route.ts` (GET status + POST actions) with RBAC via handleAdminApi.
    status: completed
  - id: admin-workers-ui
    content: Create `/admin-console/workers` page + `components/admin-console/workers.tsx` UI with enable/run-now/config controls.
    status: completed
  - id: sidebar-link
    content: Add Workers item to `components/admin-console/sidebar.tsx` navigation.
    status: completed
  - id: move-from-settings
    content: Move PnL mode/heartbeat UI from Settings page to Workers page.
    status: completed
  - id: docs-runbook
    content: "Update docs: deployment checklist + admin console module doc for worker management."
    status: completed
isProject: false
---

## Current workers in this codebase (what exists today)

- **Order execution**
  - Service: `lib/services/order/OrderExecutionWorker.ts`
  - EC2 loop script: `scripts/order-worker.ts`
  - Cron endpoint: `app/api/cron/order-worker/route.ts`
  - Vercel support: `app/api/trading/orders/route.ts` enqueues background execution (best-effort)
- **Positions PnL compute**
  - Service: `lib/services/position/PositionPnLWorker.ts`
  - EC2 loop script: `scripts/position-pnl-worker.ts`
  - Cron endpoint: `app/api/cron/position-pnl-worker/route.ts`
  - Mode toggle today: `SystemSettings.key=position_pnl_mode`
- **Risk monitoring**
  - Cron endpoint: `app/api/cron/risk-monitoring/route.ts` (invokes `RiskMonitoringService.monitorAllAccounts()`)
  - (No EC2 loop script yet; can be cron-triggered on EC2 or we add a script for parity.)

## Goal

- Add a **single place** in `/admin-console` to:
  - View **all workers** + their last run status (healthy/stale)
  - Enable/disable workers via DB settings (soft-toggle)
  - Trigger “Run now” safely (no secrets exposed)
  - Document what to run on EC2

## Constraints / expectations

- Admin Console can’t truly “start/stop” OS processes on EC2 without an external agent. Instead we’ll implement:
  - **Soft enable/disable** flags in `SystemSettings`
  - **Heartbeat** so you can see if the EC2 process is running
  - **Run once now** endpoints for manual execution

## Implementation plan

### 1) Create a Worker Registry + settings keys

- Add server utilities in `lib/server/workers/` (new folder) defining:
  - Worker IDs: `order_execution`, `position_pnl`, `risk_monitoring`
  - Setting keys (all `ownerId=null`):
    - `worker_order_execution_enabled`
    - `worker_position_pnl_enabled` (or reuse `position_pnl_mode` as the enable)
    - `worker_risk_monitoring_enabled`
    - Heartbeats: `order_worker_heartbeat`, `positions_pnl_worker_heartbeat` (already), `risk_monitoring_heartbeat`
  - Common `isHealthy(lastRunAtIso, ttlMs)` logic.

### 2) Add/standardize heartbeats for every worker

- **OrderExecutionWorker**: write heartbeat after `processPendingOrders()` (scanned/executed/cancelled/errors).
- **Risk monitoring cron**: write heartbeat after monitoring finishes.
- Keep existing PnL heartbeat.

### 3) Admin APIs for workers (secure, no CRON_SECRET in browser)

- Add `app/api/admin/workers/route.ts` using `handleAdminApi`:
  - **GET**: returns a list of workers with:
    - enabled flag
    - heartbeat
    - health status
    - suggested EC2 command / cron endpoint
  - **POST**: supports actions:
    - `toggle` (enable/disable)
    - `run_once` (calls the worker service directly with safe defaults)
    - `set_mode` for `position_pnl_mode` (client/server)

### 4) Create new Admin Console page: Workers

- Add route: `app/(admin)/admin-console/workers/page.tsx`
- Add UI component: `components/admin-console/workers.tsx`
  - Worker cards with:
    - Status badge (Active/Stale/Disabled)
    - Last run time + metrics
    - Enable toggle
    - “Run now” button
    - Config inputs (limit/threshold) where relevant

### 5) Add “Workers” to sidebar navigation

- Update `components/admin-console/sidebar.tsx` to add menu item `workers` → `/admin-console/workers`.

### 6) Move worker-related UI out of Settings

- Remove the Position PnL mode + heartbeat block from `components/admin-console/settings.tsx`.
- Re-home it inside the new Workers page under “Position PnL Worker”.

### 7) Docs / runbook updates

- Update `DEPLOYMENT_CHECKLIST.md` with a clear EC2 run list:
  - `pnpm start` (web)
  - `pnpm tsx scripts/order-worker.ts`
  - `pnpm tsx scripts/position-pnl-worker.ts` (only if PnL mode server)
  - risk monitoring schedule (cron or optional script)
- Update `components/admin-console/MODULE_DOC.md` to include the Workers page.

## Verification

- Visit `/admin-console/workers`:
  - All 3 workers visible with health status.
  - Toggling enabled updates `SystemSettings`.
  - “Run now” executes and updates heartbeat.
- On EC2:
  - Running scripts updates heartbeats continuously.
- On Vercel:
  - Heartbeats update when cron/backstop runs, and workers page reflects it.

