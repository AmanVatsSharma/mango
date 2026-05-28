# MODULE: Copy Trading

## 1. Short

Copy Trading allows slave accounts to automatically replicate trades from master traders in real time.

## 2. Purpose

Manage trading signal broadcasts and slave-to-master subscriptions. Tracks signal status and subscription relationships per tenant.

## 3. Files

```
copy-trading/
  entities/
    copy-trading-signal.entity.ts       — signal record
    copy-trading-subscription.entity.ts — subscription record
  dtos/
    create-copy-trading-subscription.dto.ts — subscription create/update
  services/
    copy-trading.service.ts    — signals and subscriptions
  controllers/
    copy-trading.controller.ts — admin REST endpoints
  copy-trading.module.ts
  index.ts
```

## 4. Flow

```
GET  /admin/copy-trading/signals       → CopyTradingService.listSignals
POST /admin/copy-trading/subscribe     → CopyTradingService.createSubscription
GET  /admin/copy-trading/performance   → CopyTradingService.getPerformanceSummary
```

## 5. Dependencies

- SharedModule (AppLoggerService)
- AuthModule (JwtAuthGuard)
- TenancyModule (TenantGuard, CurrentTenant)
- RbacModule (PermissionsGuard, Permissions)
- **OMS** — CopyTrading publishes copy signals that flow into OMS for order placement in slave accounts; signals reference OMS order IDs
- **Accounts** — CopyTrading reads account info to validate slave/master accounts and writes subscription records affecting allocation tracking

Dependency graph:
```
OMS ──→ CopyTrading (OMS publishes trade fill events consumed for signal tracking)
Accounts ──→ CopyTrading (CopyTrading reads account roles to validate master/slave relationship)
CopyTrading ──→ OMS (copy signals trigger order placement in slave accounts via OMS)
CopyTrading ──→ Accounts (subscription changes affect account-level allocation and margin tracking)
```

## 6. APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/copy-trading/signals | List signals |
| POST | /admin/copy-trading/subscribe | Subscribe slave to master |
| GET | /admin/copy-trading/performance | Performance summary |

## 7. Public route list

None — all routes require authentication.

## 8. Idempotency contract

- `subscribe` is idempotent via `(masterUserId, slaveUserId)` unique constraint

## 9. Domain events

None (stubbed)

## 10. Env vars

None specific to CopyTrading; OMS and Accounts env vars govern the downstream order placement and account validation.

## 11. Tests

Unit tests co-located `*.spec.ts`

## 12. Failure modes

| Scenario | Behavior |
|----------|----------|
| Subscription already exists | Updates copyPct in place |

## Change-log

| Date | Change |
|------|--------|
| 2026-05-16 | Initial scaffold — signals, subscriptions, performance summary |
| 2026-05-23 | Expanded module doc — added dependency graph showing CopyTrading → OMS and CopyTrading → Accounts relationships. |
