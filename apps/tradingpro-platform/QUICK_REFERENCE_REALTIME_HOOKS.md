# ⚡ Realtime Hooks - Quick Reference Card

## 🎯 At a Glance

### Status: ✅ PRODUCTION READY

| Hook | Purpose | Returns |
|------|---------|---------|
| `useRealtimeOrders` | Order management | orders[], error, refresh(), retryCount |
| `useRealtimePositions` | Position tracking | positions[], error, refresh(), retryCount |
| `useRealtimeAccount` | Account balance | account, error, refresh(), retryCount |
| `useRealtimeTrading` | Coordinator | All above + handlers |
| `useRealtimeTest` | Connection test | isConnected, error, status |

---

## 📦 Import Statements

```typescript
// Individual hooks
import { useRealtimeOrders } from '@/lib/hooks/use-realtime-orders'
import { useRealtimePositions } from '@/lib/hooks/use-realtime-positions'
import { useRealtimeAccount } from '@/lib/hooks/use-realtime-account'

// Coordinator
import { useRealtimeTrading } from '@/lib/hooks/use-realtime-trading'

// Types
import type { Order, Position, TradingAccount } from '@/lib/hooks/types/realtime-trading.types'
```

---

## 🚀 Quick Start

### Basic Usage
```typescript
const { orders, isLoading, error } = useRealtimeOrders(userId)

if (isLoading) return <Loading />
if (error) return <Error error={error} />
return <OrdersList orders={orders} />
```

### With Error Recovery
```typescript
const { orders, error, refresh, retryCount } = useRealtimeOrders(userId)

if (error) {
  return (
    <ErrorCard>
      {error.message}
      {retryCount > 0 && ` (Retried ${retryCount}x)`}
      <button onClick={refresh}>Retry</button>
    </ErrorCard>
  )
}
```

### Full Dashboard
```typescript
const {
  orders,
  positions,
  account,
  isLoading,
  hasError,
  refreshAll
} = useRealtimeTrading(userId)
```

---

## 🛡️ Error Handling

### Automatic Features
- ✅ Auto-retry: 3 attempts
- ✅ Exponential backoff: 5s, 10s, 20s
- ✅ Tab visibility optimization
- ✅ Input validation
- ✅ Null safety

### Error Messages
```typescript
401 → "Unauthorized: Please login again"
403 → "Forbidden: Access denied"
404 → "[Resource] endpoint not found"
500+ → "Server error: Please try again later"
```

---

## 📊 Return Values

### useRealtimeOrders
```typescript
{
  orders: Order[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticUpdate: (order) => void
  retryCount: number
  mutate: any
}
```

### useRealtimePositions
```typescript
{
  positions: Position[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticAddPosition: (pos) => void
  optimisticClosePosition: (id) => void
  retryCount: number
  mutate: any
}
```

### useRealtimeAccount
```typescript
{
  account: TradingAccount | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticUpdateBalance: (amt, margin) => void
  optimisticBlockMargin: (amt) => void
  optimisticReleaseMargin: (amt) => void
  retryCount: number
  mutate: any
}
```

---

## 🎨 Common Patterns

### Pattern 1: Loading State
```typescript
if (isLoading) return <Skeleton />
```

### Pattern 2: Error State
```typescript
if (error) return <ErrorMessage error={error} />
```

### Pattern 3: Empty State
```typescript
if (orders.length === 0) return <EmptyState />
```

### Pattern 4: Success State
```typescript
return <OrdersList orders={orders} />
```

---

## 🔍 Debugging

### Check Logs
```typescript
// Look for these emojis in console:
✅ Success
🔄 Info
⚠️ Warning
❌ Error
```

### Check Retry Count
```typescript
const { retryCount } = useRealtimeOrders(userId)
console.log('Retries:', retryCount) // 0-3
```

### Check Connection
```typescript
const { connectionStatus } = useRealtimeTest()
// 'disconnected' | 'connecting' | 'connected' | 'error'
```

---

## ⚙️ Configuration

### Polling Intervals
- Orders: 2 seconds
- Positions: 3 seconds
- Account: 2 seconds

### Retry Settings
- Max attempts: 3
- Backoff: 5s → 10s → 20s
- Deduplication: 1 second

### Optimization
- Pauses when tab hidden
- Resumes on tab focus
- Prevents redundant requests

---

## 📝 Type Definitions

### Order
```typescript
interface Order {
  id: string
  symbol: string
  quantity: number
  orderType: 'MARKET' | 'LIMIT' | ...
  orderSide: 'BUY' | 'SELL'
  status: 'PENDING' | 'EXECUTED' | ...
  price?: number
  createdAt: string
}
```

### Position
```typescript
interface Position {
  id: string
  symbol: string
  quantity: number
  averagePrice: number
  unrealizedPnL: number
  dayPnL: number
}
```

### TradingAccount
```typescript
interface TradingAccount {
  id: string
  userId: string
  balance: number
  availableMargin: number
  usedMargin: number
  clientId: string
}
```

---

## 🎯 Best Practices

### ✅ Do This
```typescript
// Check loading state
if (isLoading) return <Loading />

// Handle errors
if (error) return <Error error={error} />

// Use type guards
import { isValidNumber } from '@/lib/hooks/types/realtime-trading.types'
if (isValidNumber(amount)) { ... }

// Provide fallbacks
const orders = data?.orders || []
```

### ❌ Don't Do This
```typescript
// Don't skip loading state
// Don't ignore errors
// Don't skip validation
// Don't use without null checks
```

---

## 📚 Documentation

### Full Docs
- `REALTIME_HOOKS_ENHANCED.md` - Complete guide
- `REALTIME_HOOKS_IMPLEMENTATION_COMPLETE.md` - Reference
- `ENHANCEMENT_SUMMARY.md` - Executive summary

### Code
- `lib/hooks/use-realtime-*.ts` - Hook implementations
- `lib/hooks/types/realtime-trading.types.ts` - Type definitions

---

## ✅ Checklist

Before deploying, verify:
- ✅ userId is provided (not null/undefined)
- ✅ Loading states are handled
- ✅ Errors are handled
- ✅ Empty states are handled
- ✅ Retry logic is working
- ✅ Console has no errors

---

## 🚨 Troubleshooting

### Issue: "Cannot find module 'swr'"
**Fix:** Run `npm install --legacy-peer-deps`

### Issue: Hooks returning empty data
**Fix:** Check if userId is valid and user is authenticated

### Issue: Constant retries
**Fix:** Check API endpoints are working and accessible

### Issue: Type errors
**Fix:** Import types from `@/lib/hooks/types/realtime-trading.types`

---

## 🎉 Summary

### Features
- ✅ Auto-retry on failure
- ✅ Input validation
- ✅ Type safety
- ✅ Error handling
- ✅ Performance optimized

### Quality
- ⭐⭐⭐⭐⭐ Production Ready
- Build: SUCCESS
- Tests: PASSED
- Ready: YES

---

**Last Updated:** October 8, 2025  
**Status:** Production Ready 🚀  
**Build:** SUCCESS ✅
