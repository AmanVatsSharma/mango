# Risk Monitoring Integration Guide

## Quick Integration Examples

### Option 1: Event-Driven (Recommended - No Cron Needed)

**Step 1: Initialize on app startup**

```typescript
// app/layout.tsx or middleware.ts
import { initializeRiskMonitoring } from '@/lib/services/risk/RiskMonitoringIntegration'

// Initialize once on startup
if (typeof window === 'undefined') {
  initializeRiskMonitoring()
}
```

**Step 2: Trigger after position updates**

```typescript
// In PositionManagementService.closePosition() or updatePosition()
import { checkRiskAfterPositionUpdate } from '@/lib/services/risk/RiskMonitoringIntegration'

// After updating position
await this.positionRepo.update(positionId, updates)

// Trigger risk check
await checkRiskAfterPositionUpdate(tradingAccountId, userId)
```

**Step 3: Trigger after order execution**

```typescript
// In OrderService.markExecuted()
import { checkRiskAfterOrderExecution } from '@/lib/services/risk/RiskMonitoringIntegration'

// After order execution
await orderRepo.markExecuted(orderId, quantity, price)

// Trigger risk check
await checkRiskAfterOrderExecution(tradingAccountId, userId)
```

### Option 2: Queue-Based (BullMQ + Redis)

**Install dependencies:**
```bash
npm install bullmq ioredis
```

**Setup:**
```typescript
// lib/services/risk/RiskQueueService.ts
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export const riskQueue = new Queue('risk-monitoring', { connection: redis })

// Worker (runs in separate process or serverless function)
export const riskWorker = new Worker(
  'risk-monitoring',
  async (job) => {
    const { tradingAccountId, userId } = job.data
    const service = new RiskMonitoringService()
    return await service.monitorAccount(tradingAccountId, userId, thresholds)
  },
  { connection: redis }
)

// Schedule recurring job
await riskQueue.add('monitor-all', {}, {
  repeat: { every: 60000 } // Every 60 seconds
})
```

**Trigger on events:**
```typescript
import { riskQueue } from '@/lib/services/risk/RiskQueueService'

// After position update
await riskQueue.add('monitor-account', { tradingAccountId, userId }, {
  priority: 1,
  delay: 5000 // 5 second debounce
})
```

### Option 3: WebSocket-Based (Real-Time)

**Setup:**
```typescript
// lib/services/risk/RiskWebSocketMonitor.ts
import { WebSocketManager } from '@/lib/services/websocket/WebSocketManager'

WebSocketManager.on('quote:updated', async (quote) => {
  // Find positions with this instrument
  const positions = await prisma.position.findMany({
    where: {
      Stock: { instrumentId: quote.instrumentId },
      quantity: { not: 0 }
    },
    select: {
      tradingAccountId: true,
      TradingAccount: { select: { userId: true } }
    }
  })

  // Trigger risk check for each account
  for (const pos of positions) {
    await triggerRiskCheck(pos.tradingAccountId, pos.TradingAccount.userId)
  }
})
```

### Option 4: Database Polling (Simple Alternative)

**Setup:**
```typescript
// lib/services/risk/RiskPollingService.ts
import { prisma } from '@/lib/prisma'

let lastCheckTime = new Date()

setInterval(async () => {
  // Find accounts with updated positions
  const accounts = await prisma.tradingAccount.findMany({
    where: {
      positions: {
        some: {
          updatedAt: { gte: lastCheckTime },
          quantity: { not: 0 }
        }
      }
    },
    select: {
      id: true,
      userId: true
    },
    distinct: ['id']
  })

  // Check each account
  const service = new RiskMonitoringService()
  for (const account of accounts) {
    await service.monitorAccount(account.id, account.userId, thresholds)
  }

  lastCheckTime = new Date()
}, 30000) // Every 30 seconds
```

## Comparison

| Method | Setup Complexity | Latency | Infrastructure | Best For |
|--------|-----------------|---------|----------------|----------|
| **Event-Driven** | Low | Instant | None | Most use cases |
| **Queue-Based** | Medium | Low | Redis | High scale |
| **WebSocket** | Medium | Instant | WebSocket | Real-time |
| **Database Polling** | Very Low | Medium | None | Simple setup |
| **Cron** | Low | Medium | Cron service | Fallback |

## Recommended Approach

**For most cases: Use Event-Driven + Cron Backup**

1. **Primary**: Event-driven (triggers on position/order updates)
2. **Backup**: Cron endpoint (runs every 60 seconds as safety net)

This gives you:
- ✅ Immediate response to changes
- ✅ Safety net if events are missed
- ✅ No additional infrastructure needed
- ✅ Works in any environment

## Integration Checklist

- [ ] Initialize event monitor on app startup
- [ ] Add risk check after position updates
- [ ] Add risk check after order execution
- [ ] Add risk check after margin changes
- [ ] Set up cron backup (optional but recommended)
- [ ] Test with small thresholds first
- [ ] Monitor logs for errors
- [ ] Set up alerts for critical events
