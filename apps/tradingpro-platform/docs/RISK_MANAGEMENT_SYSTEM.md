# Server-Side Risk Management System

## Overview

This document describes the server-side risk management system that enforces **SL/TP + account loss thresholds** inside the long-running **Positions PnL Worker** and provides a **backstop runner** for cron/admin “run now”.

> **Update (2026-02-13 IST)**: Risk enforcement is now integrated into `lib/services/position/PositionPnLWorker.ts`.  
> `/api/admin/risk/monitor` and `/api/cron/risk-monitoring` run the **Risk Backstop** (skips when positions worker is healthy unless `forceRun=true`).  
> Canonical thresholds are stored in **SystemSettings** via `GET/PUT /api/admin/risk/thresholds` (env fallback remains supported).

## Problem Statement

Previously, P&L was calculated only on the client side. This led to several critical issues:

1. **Client-Side Only Calculation**: P&L was calculated in the browser using `useMemo`, meaning it only worked when the app was open
2. **No Server-Side Monitoring**: Positions could remain open even when losses exceeded available margin
3. **Recovery Risk**: Users could see losses exceed their funds, but positions would remain open and potentially recover, when they should have been closed at the loss threshold
4. **No Automatic Closure**: There was no mechanism to automatically close positions when risk thresholds were breached

## Solution Architecture

### Components

1. **PositionPnLWorker** (`lib/services/position/PositionPnLWorker.ts`)
   - Canonical server-side enforcer
   - Calculates live P&L using the server market-data quote cache
   - Enforces per-position StopLoss/Target and account loss-utilization thresholds
   - Creates `RiskAlert` rows (throttled) for operator visibility

2. **Risk thresholds helper** (`lib/services/risk/risk-thresholds.ts`)
   - Reads/writes canonical thresholds from `SystemSettings` (env fallback supported)
   - Keys:
     - `risk_warning_threshold`
     - `risk_auto_close_threshold`

3. **Risk backstop runner** (`lib/services/risk/risk-backstop-runner.ts`)
   - Safety net runner used by cron/admin
   - Skips when positions worker is healthy (unless force-run)
   - When running, triggers `PositionPnLWorker.processPositionPnL({ forceRun: true, ... })`

4. **API Endpoints**
   - `GET/PUT /api/admin/risk/thresholds` — read/update canonical thresholds
   - `GET /api/admin/risk/exposure-preview` — read-only preview of loss utilization vs thresholds (DB LTP; admin `admin.risk.read`)
   - `GET/POST /api/admin/risk/monitor` — run risk backstop (admin-only)
   - `GET/POST /api/cron/risk-monitoring` — cron: `mode=backstop` uses backstop; default monitor mode runs `RiskMonitoringService` with canonical thresholds

5. **Admin Console Integration**
   - Risk Management → Risk Monitoring tab:
     - Edit canonical thresholds (SystemSettings)
     - Run the unified backstop and view a worker-run summary (may be skipped if positions worker is healthy)

## How It Works

### Loss utilization (single definition)

All enforcement paths align on **loss utilization** (same helper as `position-risk-evaluator`):

\[
\text{loss utilization} = \frac{\max(0,\,-\text{net unrealized PnL})}{\text{balance} + \text{available margin}}
\]

- **Net profits do not increase** this ratio (only net **loss** counts).
- **Warning** threshold: create `LARGE_LOSS` alert; **no** auto-close.
- **Auto-close** threshold: square off worst **losing** positions until utilization drops below threshold or safety caps apply.

Cron **`/api/cron/risk-monitoring`** in default **monitor** mode runs `RiskMonitoringService.monitorAllAccounts` with thresholds from **`getRiskThresholds()`** (SystemSettings / env), not hardcoded 80/90.

### Risk Monitoring Flow

```
1. Monitor all accounts with open positions
   ↓
2. For each account:
   a. Net unrealized P&L server-side
   b. Loss utilization vs warning / auto-close (configured ratios)
   c. Warning band → alert only
   d. Auto-close band → close losers (worst first), recompute until below threshold
   ↓
3. Alerts + TradingLogger audit trail
```

### Positions PnL worker (canonical)

`PositionPnLWorker` evaluates the same loss utilization after each quote tick. Risk square-off runs in **multiple rounds** per tick (env `RISK_MAX_REDUCTION_ROUNDS_PER_TICK`, default 20; several closes per round, default 3) so one scheduled run can reduce exposure faster than a single close per account.

### Position Closure Logic

When auto-close threshold (80%) is breached:

1. **Sort positions by loss** (worst losing positions first)
2. **Close positions one by one** until utilization drops below threshold
3. **Recalculate after each closure** to ensure we don't over-close
4. **Create critical alert** for admin notification
5. **Log all actions** for audit trail

### P&L Calculation

The canonical enforcement path uses `PositionPnLWorker.processPositionPnL()` which:

1. Fetches all active positions for an account
2. Gets current LTP (Last Traded Price) from the **server market-data quote cache**
3. Calculates: `Unrealized P&L = (Current Price - Average Price) × Quantity`
4. Updates position records with latest P&L (and optionally Redis cache/SSE for smooth dashboards)
5. Enforces SL/TP + account risk thresholds and triggers safe, idempotent auto square-off when needed



### Enforcement policy (admin)

- **GET/PUT** `/api/admin/risk/enforcement-settings`
  - `fullLiquidationOnAutoClose`: each auto-close wave closes **all** losing positions (worker), not only a capped batch.
  - `squareOffOnWarningBand`: crossing the **warning** threshold triggers **automatic** square-off (worker + `RiskMonitoringService`), not only alerts.
- **POST** `/api/admin/risk/liquidate-account` — body `{ tradingAccountId, scope: "losers_only" | "all_open" }` for manual operator liquidation from Admin.
- Env overrides: `RISK_FULL_LIQUIDATION_ON_AUTO_CLOSE`, `RISK_SQUARE_OFF_ON_WARNING` (`true` / `false`).

## Configuration

### Thresholds

Default thresholds (configurable):

- **Warning Threshold**: 75% (0.75)
  - Creates HIGH severity alert
  - Does not auto-close positions
  - Admin can manually intervene

- **Auto-Close Threshold**: 80% (0.80)
  - Automatically closes losing positions
  - Creates CRITICAL severity alert
  - Stops closing when utilization drops below threshold

### Environment Variables

```bash
# Risk monitoring thresholds (optional, defaults shown)
RISK_WARNING_THRESHOLD=0.75      # 75% - warning threshold
RISK_AUTO_CLOSE_THRESHOLD=0.80   # 80% - auto-close threshold

# Positions worker: max close→recompute rounds per account per tick (default 20)
RISK_MAX_REDUCTION_ROUNDS_PER_TICK=20

# Cron secret for protecting cron endpoint
CRON_SECRET=your-secret-key-here
RISK_MONITORING_SECRET=your-secret-key-here  # Alternative name
```

## Setup Instructions

### 1. Manual Testing

Use the admin console:

1. Navigate to **Admin Console → Risk Management → Risk Monitoring**
2. Configure thresholds (default: 75% warning, 80% auto-close)
3. Click **"Run Risk Monitoring Now"**
4. View results in the dashboard

### 2. Automated Cron Setup

#### Option A: Vercel Cron (Recommended)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/risk-monitoring",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This runs every minute. For production, consider:
- `*/30 * * * *` - Every 30 seconds
- `*/60 * * * *` - Every minute
- `0 9-16 * * 1-5` - Every hour during market hours (9 AM - 4 PM, Mon-Fri)

**Important**: Set `CRON_SECRET` environment variable in Vercel dashboard.

#### Option B: External Cron Service

Use services like:
- **cron-job.org**
- **EasyCron**
- **GitHub Actions** (with scheduled workflows)

Example cron command:
```bash
# Every minute
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron/risk-monitoring
```

#### Option C: Server-Side Cron

If running on a server with cron:

```bash
# Edit crontab
crontab -e

# Add (runs every minute during market hours)
* 9-16 * * 1-5 curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron/risk-monitoring
```

### 3. Background Job (Alternative)

For continuous monitoring without cron:

```typescript
import { getRiskMonitoringJob } from '@/lib/services/risk/RiskMonitoringJob'

// Start monitoring every 60 seconds
const job = getRiskMonitoringJob()
job.start(60000) // 60 seconds

// Stop when needed
// job.stop()
```

## API Reference

### POST /api/admin/risk/monitor

Manual trigger for the **risk backstop** (admin only).

**Request Body:**
```json
{
  "forceRun": false
}
```

**Response:**
```json
{
  "success": true,
  "thresholds": {
    "warningThreshold": 0.75,
    "autoCloseThreshold": 0.8,
    "source": "system_settings"
  },
  "result": {
    "success": true,
    "skipped": true,
    "skippedReason": "positions_worker_healthy",
    "pnlWorkerHealth": "healthy",
    "pnlWorkerLastRunAtIso": "2026-02-13T10:00:00.000Z",
    "elapsedMs": 12,
    "result": { "heartbeat": { "skipped": true } }
  }
}
```

### GET/PUT /api/admin/risk/thresholds

Read/update canonical thresholds stored in `SystemSettings`.

- **GET** returns `{ success, thresholds }`
- **PUT** accepts:

```json
{
  "warningThreshold": 0.75,
  "autoCloseThreshold": 0.8
}
```

### GET /api/cron/risk-monitoring

Cron endpoint (protected by `CRON_SECRET`).

**Headers:**
```
Authorization: Bearer YOUR_CRON_SECRET
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-01-27T10:30:00.000Z",
  "result": {
    "success": true,
    "skipped": true,
    "skippedReason": "positions_worker_healthy",
    "pnlWorkerHealth": "healthy",
    "pnlWorkerLastRunAtIso": "2026-02-13T10:00:00.000Z",
    "elapsedMs": 12
  }
}
```

## Risk Alerts

The system creates `RiskAlert` records in the database:

- **Type**: `MARGIN_CALL` (auto-close) or `LARGE_LOSS` (warning)
- **Severity**: `CRITICAL` (auto-close) or `HIGH` (warning)
- **Message**: Detailed description of the risk event
- **Resolved**: `false` (can be resolved by admin)

View alerts in: **Admin Console → Risk Management → User Risk Limits → Risk Alerts**

## Monitoring & Logging

All risk monitoring actions are logged via structured server logs:

- **TradingLog**: Position closures, alerts created
- **RiskAlert**: Alert records in database
- **Worker heartbeats**: `positions_pnl_worker_heartbeat` and `risk_monitoring_heartbeat` in `SystemSettings`

## Best Practices

1. **Run Frequently**: During market hours, run every 30-60 seconds
2. **Monitor Alerts**: Check risk alerts regularly in admin console
3. **Adjust Thresholds**: Fine-tune thresholds based on your risk appetite
4. **Test First**: Test with small thresholds before production
5. **Monitor Logs**: Check logs for any errors or issues
6. **Backup Plan**: Keep manual monitoring as backup

## Troubleshooting

### Positions Not Closing

1. Check if threshold is configured correctly
2. Verify market data API is accessible
3. Check logs for errors
4. Verify positions have valid `instrumentId` for price lookup

### Cron Not Running

1. Verify `CRON_SECRET` is set correctly
2. Check cron service logs
3. Test endpoint manually with correct auth header
4. Verify endpoint is accessible (not blocked by firewall)

### P&L Calculation Issues

1. Check market data API availability
2. Verify positions have valid `Stock` relations
3. Check `instrumentId` format matches market data API
4. Review `PositionPnLWorker` logs + heartbeat fields for quote freshness and per-tick counters

## Future Enhancements

Potential improvements:

1. **Per-User Thresholds**: Allow different thresholds per user
2. **Position-Level Thresholds**: Set thresholds per position
3. **SMS/Email Alerts**: Notify users when positions are auto-closed
4. **Market Hours Detection**: Only run during market hours
5. **Graduated Closure**: Close partial positions instead of full closure
6. **Risk Score**: Calculate overall account risk score
7. **Historical Analysis**: Track risk events over time

## Changelog

### 2025-01-27
- Initial implementation of server-side risk monitoring
- Automatic position closure at 80% threshold
- Warning alerts at 75% threshold
- Admin console integration
- Cron endpoint for automated execution

### 2026-02-13
- Canonical enforcement moved into `PositionPnLWorker` (SL/TP + account thresholds).
- `/api/admin/risk/monitor` and `/api/cron/risk-monitoring` repurposed as a backstop runner (skips when positions worker is healthy unless force-run).
- Added `GET/PUT /api/admin/risk/thresholds` for SystemSettings-backed canonical thresholds.
