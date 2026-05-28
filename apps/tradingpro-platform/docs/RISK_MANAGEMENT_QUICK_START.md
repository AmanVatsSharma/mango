# Risk Management Quick Start Guide

## Problem Solved

✅ **Server-side P&L calculation** - No longer client-side only  
✅ **Automatic position closure** - Closes positions when loss exceeds 90% of available funds  
✅ **Works 24/7** - Even when users close their app  
✅ **Warning alerts** - Alerts at 80% threshold before auto-close  

> **Update (2026-02-13 IST)**: Canonical risk enforcement is integrated into `PositionPnLWorker`.  
> `/api/cron/risk-monitoring` and `/api/admin/risk/monitor` run a **backstop** that skips when the positions worker is healthy (unless force-run).

## Quick Setup

### 1. Test Manually (Admin Console)

1. Go to: **Admin Console → Risk Management → Risk Monitoring**
2. (Optional) Save thresholds (stored in SystemSettings)
3. Click **"Run backstop now"**
3. View results

### 2. Set Up Automated Cron

#### For Vercel:

Create/update `vercel.json`:

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

Set environment variable in Vercel:
```
CRON_SECRET=your-secret-here
```

#### For External Cron:

```bash
# Every minute
curl -H "Authorization: Bearer YOUR_SECRET" \
  https://your-domain.com/api/cron/risk-monitoring
```

### 3. Configure Thresholds (Optional)

Default thresholds:
- **Warning**: 80% (creates alert)
- **Auto-Close**: 90% (closes positions)

Recommended: configure thresholds in **SystemSettings** via Admin Console (or API).

To change via env (fallback only), set:
```bash
RISK_WARNING_THRESHOLD=0.80
RISK_AUTO_CLOSE_THRESHOLD=0.90
```

Canonical keys in SystemSettings:

- `risk_warning_threshold`
- `risk_auto_close_threshold`

## How It Works

1. **Positions PnL Worker ticks continuously** (EC2/Docker recommended)
2. **Calculates P&L server-side** using live market data (server quote cache)
3. **Checks loss utilization**: `(-min(0, totalUnrealizedPnL)) / (balance + availableMargin)`
4. **At warning threshold**: Creates throttled risk alerts
5. **At auto-close threshold**: Auto-closes positions (bounded per tick; worst-first when risk-driven)
6. **Backstop cron/admin run-now** triggers the worker only if it is stale (unless force-run)

## API Endpoints

- `GET/PUT /api/admin/risk/thresholds` - Read/update canonical thresholds (admin)
- `POST /api/admin/risk/monitor` - Run risk backstop (admin)
- `GET/POST /api/cron/risk-monitoring` - Cron backstop endpoint (protected)

## Monitoring

- **Admin Console**:
  - Risk Management → Risk Monitoring tab (thresholds + run-now)
  - Workers page (heartbeats + skip reasons)
- **Alerts**: Risk Management → User Risk Limits → Risk Alerts
- **Logs**: Check server logs + worker heartbeat JSON in SystemSettings

## Important Notes

⚠️ **Market Hours**: Consider running only during market hours  
⚠️ **Frequency**: Recommended every 30-60 seconds during trading  
⚠️ **Testing**: Test with small thresholds first  
⚠️ **Backup**: Keep manual monitoring as backup  

## Troubleshooting

**Positions not closing?**
- Check threshold configuration
- Verify market data API is accessible
- Check logs for errors

**Cron not running?**
- Verify `CRON_SECRET` is set
- Test endpoint manually
- Check cron service logs

For detailed documentation, see: `docs/RISK_MANAGEMENT_SYSTEM.md`
