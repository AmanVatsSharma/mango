# Risk Monitoring Alternatives to Cron Jobs

This document outlines various alternatives to traditional cron jobs for running the risk monitoring service.

## 1. **Event-Driven Monitoring** ⭐ (Recommended)

Trigger risk monitoring immediately when positions change, rather than polling.

### How It Works
- Monitor position updates in real-time
- Trigger risk check when position changes
- Immediate response to risk events

### Implementation

**Option A: Database Triggers (PostgreSQL)**
```sql
-- Create trigger function
CREATE OR REPLACE FUNCTION trigger_risk_check()
RETURNS TRIGGER AS $$
BEGIN
  -- Call risk monitoring API via pg_net or HTTP extension
  PERFORM net.http_post(
    url := 'https://your-domain.com/api/admin/risk/monitor',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.risk_secret'))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on position updates
CREATE TRIGGER position_risk_check
AFTER UPDATE OF quantity, unrealizedPnL ON positions
FOR EACH ROW
WHEN (OLD.quantity != NEW.quantity OR OLD."unrealizedPnL" != NEW."unrealizedPnL")
EXECUTE FUNCTION trigger_risk_check();
```

**Option B: Application-Level Event Emitter**
```typescript
// lib/services/risk/RiskEventMonitor.ts
import { EventEmitter } from 'events'
import { RiskMonitoringService } from './RiskMonitoringService'

class RiskEventMonitor extends EventEmitter {
  private monitoringService: RiskMonitoringService
  private debounceTimer: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    super()
    this.monitoringService = new RiskMonitoringService()
    this.setupListeners()
  }

  setupListeners() {
    // Listen to position updates
    this.on('position:updated', (tradingAccountId: string) => {
      this.debouncedCheck(tradingAccountId)
    })

    this.on('order:executed', (tradingAccountId: string) => {
      this.debouncedCheck(tradingAccountId)
    })
  }

  private debouncedCheck(tradingAccountId: string) {
    // Debounce: wait 5 seconds before checking (avoid spam)
    const existing = this.debounceTimer.get(tradingAccountId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(async () => {
      await this.monitoringService.monitorAccount(tradingAccountId, userId, thresholds)
      this.debounceTimer.delete(tradingAccountId)
    }, 5000)

    this.debounceTimer.set(tradingAccountId, timer)
  }
}

export const riskEventMonitor = new RiskEventMonitor()
```

**Usage in Position Service:**
```typescript
// After position update
await positionRepo.update(positionId, updates)
riskEventMonitor.emit('position:updated', tradingAccountId)
```

### Pros
- ✅ Immediate response
- ✅ No unnecessary polling
- ✅ Efficient resource usage
- ✅ Real-time risk management

### Cons
- ❌ Requires event infrastructure
- ❌ More complex setup
- ❌ Need to handle event failures

---

## 2. **Queue-Based System** ⭐⭐ (Best for Scale)

Use a job queue system like Bull/BullMQ with Redis.

### Implementation

```bash
npm install bullmq ioredis
```

```typescript
// lib/services/risk/RiskQueueService.ts
import { Queue, Worker } from 'bullmq'
import { RiskMonitoringService } from './RiskMonitoringService'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

// Create queue
export const riskMonitoringQueue = new Queue('risk-monitoring', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
})

// Create worker
export const riskMonitoringWorker = new Worker(
  'risk-monitoring',
  async (job) => {
    const { tradingAccountId, userId, thresholds } = job.data
    const service = new RiskMonitoringService()
    return await service.monitorAccount(tradingAccountId, userId, thresholds)
  },
  { connection: redis }
)

// Schedule recurring job
export async function scheduleRiskMonitoring() {
  await riskMonitoringQueue.add(
    'monitor-all-accounts',
    {},
    {
      repeat: {
        every: 60000, // Every 60 seconds
      },
    }
  )
}

// Trigger on position update
export async function triggerAccountCheck(tradingAccountId: string, userId: string) {
  await riskMonitoringQueue.add(
    'monitor-account',
    { tradingAccountId, userId },
    {
      priority: 1, // High priority
      delay: 5000, // 5 second delay (debounce)
    }
  )
}
```

**Usage:**
```typescript
// In position update handler
import { triggerAccountCheck } from '@/lib/services/risk/RiskQueueService'

await positionRepo.update(positionId, updates)
await triggerAccountCheck(tradingAccountId, userId)
```

### Pros
- ✅ Scalable (multiple workers)
- ✅ Retry logic built-in
- ✅ Priority queues
- ✅ Job monitoring dashboard
- ✅ Works well with serverless

### Cons
- ❌ Requires Redis
- ❌ Additional infrastructure
- ❌ More complex setup

---

## 3. **WebSocket-Based Real-Time Monitoring**

Monitor positions via WebSocket and trigger checks on price updates.

### Implementation

```typescript
// lib/services/risk/RiskWebSocketMonitor.ts
import { WebSocketManager } from '@/lib/services/websocket/WebSocketManager'

export class RiskWebSocketMonitor {
  private monitoringService: RiskMonitoringService
  private accountChecks: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    this.monitoringService = new RiskMonitoringService()
    this.setupWebSocketListeners()
  }

  setupWebSocketListeners() {
    // Listen to quote updates
    WebSocketManager.on('quote:updated', async (data: { instrumentId: string }) => {
      // Find all positions with this instrument
      const positions = await prisma.position.findMany({
        where: {
          Stock: { instrumentId: data.instrumentId },
          quantity: { not: 0 }
        },
        select: {
          tradingAccountId: true,
          TradingAccount: {
            select: { userId: true }
          }
        }
      })

      // Trigger risk check for each affected account
      for (const pos of positions) {
        this.debouncedCheck(pos.tradingAccountId, pos.TradingAccount.userId)
      }
    })
  }

  private debouncedCheck(tradingAccountId: string, userId: string) {
    const key = tradingAccountId
    const existing = this.accountChecks.get(key)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(async () => {
      await this.monitoringService.monitorAccount(
        tradingAccountId,
        userId,
        { warningThreshold: 0.80, autoCloseThreshold: 0.90 }
      )
      this.accountChecks.delete(key)
    }, 10000) // 10 second debounce

    this.accountChecks.set(key, timer)
  }
}
```

### Pros
- ✅ Real-time response to market changes
- ✅ Efficient (only checks when prices change)
- ✅ No polling overhead

### Cons
- ❌ Requires WebSocket infrastructure
- ❌ Complex to implement
- ❌ May miss updates if WebSocket disconnects

---

## 4. **Database Polling with Change Detection**

Poll database for changes instead of time-based cron.

### Implementation

```typescript
// lib/services/risk/RiskPollingService.ts
import { prisma } from '@/lib/prisma'

export class RiskPollingService {
  private lastCheckTime: Date = new Date()
  private isRunning: boolean = false

  async start() {
    if (this.isRunning) return
    this.isRunning = true

    setInterval(async () => {
      // Find positions updated since last check
      const updatedPositions = await prisma.position.findMany({
        where: {
          updatedAt: { gte: this.lastCheckTime },
          quantity: { not: 0 }
        },
        select: {
          tradingAccountId: true,
          TradingAccount: {
            select: { userId: true }
          }
        },
        distinct: ['tradingAccountId']
      })

      // Check only affected accounts
      for (const pos of updatedPositions) {
        await this.monitoringService.monitorAccount(
          pos.tradingAccountId,
          pos.TradingAccount.userId,
          thresholds
        )
      }

      this.lastCheckTime = new Date()
    }, 30000) // Check every 30 seconds
  }
}
```

### Pros
- ✅ Only checks changed accounts
- ✅ Simpler than full cron
- ✅ No external dependencies

### Cons
- ❌ Still polling-based
- ❌ May miss rapid changes
- ❌ Requires running process

---

## 5. **Serverless Scheduled Functions**

Use cloud provider's scheduled function services.

### AWS Lambda + EventBridge

```typescript
// api/risk-monitoring-handler.ts
import { RiskMonitoringService } from '@/lib/services/risk/RiskMonitoringService'

export const handler = async (event: any) => {
  const service = new RiskMonitoringService()
  const result = await service.monitorAllAccounts()
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  }
}
```

**EventBridge Rule:**
```json
{
  "Rules": [{
    "Name": "risk-monitoring-rule",
    "ScheduleExpression": "rate(1 minute)",
    "Targets": [{
      "Arn": "arn:aws:lambda:region:account:function:risk-monitoring",
      "Id": "1"
    }]
  }]
}
```

### Google Cloud Functions + Cloud Scheduler

```typescript
// functions/risk-monitoring/index.ts
import { RiskMonitoringService } from '@/lib/services/risk/RiskMonitoringService'

export const riskMonitoring = async (req: any, res: any) => {
  const service = new RiskMonitoringService()
  const result = await service.monitorAllAccounts()
  res.json(result)
}
```

**Cloud Scheduler:**
```bash
gcloud scheduler jobs create http risk-monitoring \
  --schedule="*/1 * * * *" \
  --uri="https://your-region-your-project.cloudfunctions.net/risk-monitoring" \
  --http-method=GET
```

### Pros
- ✅ No server management
- ✅ Auto-scaling
- ✅ Pay per execution
- ✅ Built-in scheduling

### Cons
- ❌ Cold start latency
- ❌ Vendor lock-in
- ❌ May have execution time limits

---

## 6. **In-Memory Scheduler (node-cron)**

Run scheduler in your Next.js app (not recommended for production).

### Implementation

```typescript
// lib/services/risk/RiskScheduler.ts
import cron from 'node-cron'
import { RiskMonitoringService } from './RiskMonitoringService'

export function startRiskScheduler() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    const service = new RiskMonitoringService()
    await service.monitorAllAccounts()
  })

  console.log('✅ Risk monitoring scheduler started')
}
```

**In `app/api/ready/route.ts` or startup:**
```typescript
import { startRiskScheduler } from '@/lib/services/risk/RiskScheduler'

if (process.env.NODE_ENV === 'production') {
  startRiskScheduler()
}
```

### Pros
- ✅ Simple setup
- ✅ No external dependencies
- ✅ Works in any Node.js environment

### Cons
- ❌ Requires always-on server
- ❌ Stops if app restarts
- ❌ Not ideal for serverless
- ❌ Single point of failure

---

## 7. **Message Queue (RabbitMQ/Redis Pub-Sub)**

Use message queue for distributed risk monitoring.

### Implementation (Redis Pub/Sub)

```typescript
// lib/services/risk/RiskMessageQueue.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// Publisher (when position updates)
export async function publishRiskCheck(tradingAccountId: string) {
  await redis.publish('risk:check', JSON.stringify({ tradingAccountId }))
}

// Subscriber (worker process)
export function subscribeRiskChecks() {
  const subscriber = new Redis(process.env.REDIS_URL)
  
  subscriber.subscribe('risk:check', (err, count) => {
    if (err) {
      console.error('Failed to subscribe:', err)
    } else {
      console.log(`Subscribed to risk:check (${count} subscribers)`)
    }
  })

  subscriber.on('message', async (channel, message) => {
    const { tradingAccountId } = JSON.parse(message)
    const service = new RiskMonitoringService()
    // Get userId from tradingAccountId
    const account = await prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: { userId: true }
    })
    if (account) {
      await service.monitorAccount(tradingAccountId, account.userId, thresholds)
    }
  })
}
```

### Pros
- ✅ Decoupled architecture
- ✅ Multiple workers can subscribe
- ✅ Scalable
- ✅ Real-time

### Cons
- ❌ Requires message broker
- ❌ More complex
- ❌ Need to handle message failures

---

## 8. **Hybrid Approach** ⭐⭐⭐ (Best Solution)

Combine multiple methods for reliability.

### Recommended Architecture

```typescript
// lib/services/risk/RiskMonitoringOrchestrator.ts
import { RiskMonitoringService } from './RiskMonitoringService'
import { riskEventMonitor } from './RiskEventMonitor'
import { riskMonitoringQueue } from './RiskQueueService'

export class RiskMonitoringOrchestrator {
  // Method 1: Event-driven (primary)
  setupEventDriven() {
    riskEventMonitor.on('position:updated', async (tradingAccountId, userId) => {
      await this.checkAccount(tradingAccountId, userId)
    })
  }

  // Method 2: Queue-based (backup)
  setupQueue() {
    // Recurring job every 60 seconds as backup
    await riskMonitoringQueue.add(
      'monitor-all',
      {},
      { repeat: { every: 60000 } }
    )
  }

  // Method 3: WebSocket (real-time)
  setupWebSocket() {
    // Monitor price changes via WebSocket
  }

  private async checkAccount(tradingAccountId: string, userId: string) {
    const service = new RiskMonitoringService()
    await service.monitorAccount(tradingAccountId, userId, thresholds)
  }
}
```

### Strategy
1. **Primary**: Event-driven (immediate on position updates)
2. **Backup**: Queue-based (every 60 seconds, catches missed events)
3. **Real-time**: WebSocket (on price changes)
4. **Fallback**: Cron endpoint (manual/admin trigger)

---

## Comparison Table

| Method | Latency | Complexity | Scalability | Cost | Reliability |
|--------|---------|------------|-------------|------|-------------|
| **Event-Driven** | Instant | Medium | High | Low | Medium |
| **Queue-Based** | Low | High | Very High | Medium | High |
| **WebSocket** | Instant | High | Medium | Low | Medium |
| **Database Polling** | Medium | Low | Medium | Low | High |
| **Serverless Scheduled** | Medium | Low | Very High | Low | High |
| **In-Memory Scheduler** | Low | Very Low | Low | Low | Low |
| **Message Queue** | Low | High | Very High | Medium | High |
| **Hybrid** | Instant | Very High | Very High | Medium | Very High |

---

## Recommendations

### For Your Use Case (Next.js + Prisma + Trading Platform)

**Best Option: Hybrid Approach**

1. **Primary**: Event-driven monitoring (trigger on position updates)
2. **Backup**: Queue-based system (BullMQ + Redis) for reliability
3. **Fallback**: Cron endpoint for manual/admin triggers

**Why?**
- ✅ Immediate response to position changes
- ✅ Reliable with queue retry logic
- ✅ Scalable with multiple workers
- ✅ Works in serverless environments
- ✅ No single point of failure

**Implementation Priority:**
1. Start with **event-driven** (easiest, immediate benefit)
2. Add **queue system** for production reliability
3. Keep **cron endpoint** as admin fallback

---

## Quick Implementation Guide

See implementation examples in:
- `lib/services/risk/RiskEventMonitor.ts` (Event-driven)
- `lib/services/risk/RiskQueueService.ts` (Queue-based)
- `lib/services/risk/RiskWebSocketMonitor.ts` (WebSocket)

Choose based on your infrastructure and requirements!
