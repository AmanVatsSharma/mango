# WebSocket Watchlist Price Update Fix

**Date:** 2025-01-27  
**Status:** ✅ Fixed  
**Issue:** Watchlist ticker prices not updating via WebSocket, while index prices updated correctly

---

## Problem Identified

### Root Cause
**Quote key mismatch** between storage and access patterns:

- **WebSocket Storage:** Quotes keyed by token string → `quotes["26000"]`
- **Index Display (✅ Working):** Accesses `quotes[token.toString()]` → `quotes["26000"]` ✅
- **Watchlist (❌ Broken):** Accessed `quotes[item.instrumentId]` → `quotes["NSE_EQ-26000"]` ❌

### Why Index Prices Worked But Watchlist Didn't

1. **Index tokens** (26000, 26009) are hardcoded in `INDEX_INSTRUMENTS`
2. **Index display** correctly accesses `quotes[token.toString()]` (line 92 in TradingDashboard.tsx)
3. **Watchlist** was incorrectly using `quotes[item.instrumentId]` which doesn't exist
4. WebSocket never stored quotes with instrumentId format ("NSE_EQ-26000")

---

## Solution Implemented

### Changes Made

#### 1. Fixed Quote Access Pattern (`components/watchlist/WatchlistManager.tsx`)

**Before (Line 621):**
```typescript
const quote = quotes?.[item.instrumentId || '']  // ❌ "NSE_EQ-26000" doesn't exist
```

**After (Line 632):**
```typescript
// CRITICAL FIX: Use token instead of instrumentId for quote lookup
const quoteKey = item.token ? item.token.toString() : (item.instrumentId || '')
const quote = quotes?.[quoteKey]  // ✅ "26000" exists!
```

#### 2. Fixed Market Depth & OHLC Data Access

Updated all instances where `item.instrumentId` was used for quote access:

**Before:**
```typescript
quotes[item.instrumentId]?.display_price  // ❌ Wrong key
```

**After:**
```typescript
quotes[quoteKey]?.display_price  // ✅ Correct key
```

#### 3. Added Debug Logging

Added comprehensive logging to diagnose missing tokens:

```typescript
// Log first item structure
if (itemIndex === 0) {
  console.log('🔍 [WATCHLIST-MANAGER] First item debug:', {
    itemId: item.id,
    instrumentId: item.instrumentId,
    token: item.token,
    symbol: item.symbol,
    availableQuoteKeys: Object.keys(quotes || {}),
    hasToken: !!item.token
  })
}

// Warn if quote not found
if (!quote && item.token) {
  console.warn(`⚠️ [WATCHLIST-MANAGER] Quote not found for token ${item.token}`)
}
```

#### 4. Added Token Validation (`lib/hooks/use-trading-data.ts`)

Added warnings when watchlist items are missing tokens:

```typescript
// Warn if token is missing - required for WebSocket updates
if (!transformedItem.token) {
  console.warn(`⚠️ [TRADING-DATA] WatchlistItem missing token - will not receive WebSocket updates:`, {
    itemId: transformedItem.id,
    symbol: transformedItem.symbol,
    warning: 'Token is required for real-time price subscriptions'
  })
}
```

#### 5. Updated Documentation

Updated file header with critical information:

```typescript
/**
 * CRITICAL: WebSocket Quotes Access Pattern
 * - WebSocket stores quotes keyed by TOKEN (e.g., quotes["26000"])
 * - Watchlist items must use item.token.toString() to access quotes
 * - DO NOT use item.instrumentId for quote lookup
 * - Fallback to instrumentId only if token is unavailable
 */
```

---

## Files Modified

1. **`components/watchlist/WatchlistManager.tsx`**
   - Lines 617-642: Added debug logging and fixed quote key lookup
   - Lines 660-678: Fixed market depth and OHLC quote access
   - Lines 1-15: Updated file header with critical documentation

2. **`lib/hooks/use-trading-data.ts`**
   - Lines 603-612: Added token validation warnings
   - Lines 614-620: Enhanced logging with token information

---

## How It Works Now

### Quote Access Flow

1. **Watchlist Item Structure:**
   ```typescript
   {
     id: "abc123",
     symbol: "RELIANCE",
     instrumentId: "NSE_EQ-2881",
     token: 2881  // ✅ This is what WebSocket uses
   }
   ```

2. **Quote Lookup:**
   ```typescript
   const quoteKey = item.token ? item.token.toString() : item.instrumentId
   const quote = quotes[quoteKey]  // quotes["2881"]
   ```

3. **WebSocket Storage:**
   ```typescript
   // In WebSocketMarketDataService
   quotes[instrumentToken.toString()] = enhancedQuote  // "2881" = {...}
   ```

4. **Result:**
   - ✅ Watchlist now finds quotes by token
   - ✅ Prices update in real-time via WebSocket
   - ✅ Falls back to instrumentId if token missing

---

## Testing Recommendations

### Verify Fix

1. **Open Browser Console:**
   - Look for `🔍 [WATCHLIST-MANAGER] First item debug` log
   - Verify `token` field exists on watchlist items
   - Check `availableQuoteKeys` includes token values

2. **Monitor WebSocket Updates:**
   - Check console for `📊 [HOOK-WS-MARKET-DATA] Price update` logs
   - Verify token values in the update
   - Ensure prices change in real-time on watchlist

3. **Check for Warnings:**
   - If you see `⚠️ WatchlistItem missing token`, those items won't update
   - Must ensure database has token field populated

### Common Issues

**Issue:** "Quote not found for token XXXX"
- **Cause:** WebSocket subscription not confirmed for that token
- **Solution:** Check WebSocket logs for subscription confirmations

**Issue:** "WatchlistItem missing token"
- **Cause:** Database record doesn't have token field
- **Solution:** Update watchlist items to include token field

---

## Related Components

- **Index Display:** `components/trading/TradingDashboard.tsx` (lines 84-122)
  - Already working correctly using token-based access
  - Reference implementation for quote access

- **WebSocket Provider:** `lib/market-data/providers/WebSocketMarketDataProvider.tsx`
  - Stores quotes keyed by token (line 314)
  - Subscribes to watchlist tokens (lines 156-178)

- **WebSocket Service:** `lib/market-data/services/WebSocketMarketDataService.ts`
  - Processes market data and stores by token (line 285)
  - Emits price updates to subscribers (line 289)

---

## Prevention

### Code Review Checklist

- ✅ Always use `token` for WebSocket quote access
- ✅ Never use `instrumentId` for quote lookup
- ✅ Add fallback for missing tokens
- ✅ Log quote key lookup attempts
- ✅ Validate token field on watchlist items

### Future Development

When adding new components that use WebSocket quotes:
1. Always use token-based keys: `quotes[token.toString()]`
2. Add debug logging for first quote access
3. Include token validation in data transformation
4. Document the access pattern in file headers

---

## Author Notes

This fix aligns watchlist component with the working index display pattern, ensuring consistent WebSocket quote access throughout the application. The token-based key system is now the standard for all WebSocket price lookups.

**Related:** See `docs/WEBSOCKET_ARCHITECTURE.md` for overall WebSocket implementation details.
