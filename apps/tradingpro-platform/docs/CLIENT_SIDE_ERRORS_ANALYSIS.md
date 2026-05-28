/**
 * @file CLIENT_SIDE_ERRORS_ANALYSIS.md
 * @module docs
 * @description Analysis of potential client-side errors in dashboard watchlist components after Stock model removal
 * @author BharatERP
 * @created 2025-01-28
 */

# Client-Side Errors Analysis - Dashboard Watchlist

## Executive Summary

After analyzing the dashboard and watchlist implementation post-Stock model removal, potential client-side errors have been identified. The schema migration left some fields as nullable (`symbol`, `exchange`, `segment`, `name`), which could cause runtime errors if not handled properly.

## Browser Console Findings

**From Browser Inspection:**
- ✅ **No Critical Errors Found** - Page loads successfully, no uncaught exceptions
- ⚠️ **Minor Warning**: Input elements should have autocomplete attributes (accessibility issue, not breaking)
- ✅ **No React Errors**: No hydration errors or React component errors detected
- ✅ **Network Requests**: All API calls successful (session check, asset loading)

## Potential Issues Identified

### 1. **Nullable Fields in Transform Functions**

**Location**: `lib/hooks/use-prisma-watchlist.ts:118-120`

**Issue**: Fields like `symbol`, `name`, `exchange` are directly assigned without null checks:
```typescript
symbol: item.symbol,  // Could be null/undefined
name: item.name,      // Could be null/undefined
exchange: item.exchange, // Could be null/undefined
```

**Risk Level**: ⚠️ **Medium** - If existing WatchlistItems have null values, UI may display "null" or "undefined"

**Fix**: Add fallback values:
```typescript
symbol: item.symbol || 'UNKNOWN',
name: item.name || 'Unknown',
exchange: item.exchange || 'NSE',
segment: item.segment || 'NSE',
```

### 2. **InstrumentId Generation with Null Exchange**

**Location**: `lib/hooks/use-prisma-watchlist.ts:103-105`

**Issue**: InstrumentId generation may create invalid IDs if exchange is null:
```typescript
const instrumentId = item.token && item.exchange 
  ? `${item.exchange}-${item.token}` 
  : item.stockId || `unknown-${item.id}`
```

**Risk Level**: ✅ **Low** - Fallback exists, but could improve

**Fix**: Already handled with fallback, but could add logging:
```typescript
if (!item.token || !item.exchange) {
  console.warn('⚠️ [TRANSFORM] WatchlistItem missing token or exchange:', {
    itemId: item.id,
    token: item.token,
    exchange: item.exchange
  })
}
```

### 3. **WebSocket Provider Missing Token Warnings**

**Location**: `lib/market-data/providers/WebSocketMarketDataProvider.tsx:169-176`

**Current Behavior**: ✅ **Good** - Logs warning but doesn't crash

**Risk Level**: ✅ **Low** - Already handled gracefully

### 4. **WatchlistItemCard Display with Null Values**

**Location**: `components/watchlist/WatchlistItemCard.tsx:83-191`

**Current Behavior**: ✅ **Good** - Uses optional chaining (`item.exchange?.toUpperCase()`)

**Risk Level**: ✅ **Low** - Already null-safe

**Note**: Badge functions handle undefined values well with defaults.

### 5. **Database Migration - Data Loss Risk**

**Issue**: Existing WatchlistItems might have null values for newly required fields if migration script wasn't run.

**Status**: Schema fields are temporarily nullable with defaults:
- `symbol String? @default("UNKNOWN")`
- `exchange String? @default("NSE")`
- `segment String? @default("NSE")`
- `name String? @default("Unknown")`

**Risk Level**: ⚠️ **Medium** - Existing rows may not have proper values populated

**Action Required**: 
1. Run data migration script to backfill existing WatchlistItems
2. After migration, make fields non-nullable

## Recommended Fixes

### Fix 1: Update Transform Function to Handle Nulls

**File**: `lib/hooks/use-prisma-watchlist.ts`

```typescript
return {
  id: item.stockId || item.id,
  watchlistItemId: item.id,
  instrumentId,
  symbol: item.symbol || 'UNKNOWN',
  name: item.name || 'Unknown',
  exchange: item.exchange || 'NSE',
  segment: item.segment || 'NSE',
  ltp: toNumber(item.ltp),
  close: toNumber(item.close),
  // ... rest of fields
}
```

### Fix 2: Add Null Checks in useUserWatchlist Transform

**File**: `lib/hooks/use-trading-data.ts:557-572`

```typescript
return {
  watchlistItemId: item.id,
  id: item.id,
  instrumentId,
  token: item.token ? Number(item.token) : undefined,
  symbol: item.symbol || 'UNKNOWN',
  name: item.name || 'Unknown',
  ltp: toNumber(item.ltp),
  close: toNumber(item.close),
  exchange: item.exchange || 'NSE',
  segment: item.segment || 'NSE',
  // ... rest of fields
}
```

### Fix 3: Run Data Migration Script

**Action**: Execute migration to populate existing WatchlistItems:
```bash
npx tsx prisma/migrations/migrate-watchlist-data.ts
```

**Note**: Migration script was deleted, need to recreate if needed.

### Fix 4: Make Schema Fields Non-Nullable After Migration

**File**: `prisma/schema.prisma`

After confirming all data is migrated:
```prisma
symbol        String   @default("UNKNOWN")
exchange      String   @default("NSE")
segment       String   @default("NSE")
name          String   @default("Unknown")
```

## Testing Checklist

- [ ] Test with empty watchlist (no items)
- [ ] Test with watchlist containing items with null symbol
- [ ] Test with watchlist containing items with null exchange
- [ ] Test adding new item (should have all fields populated)
- [ ] Test WebSocket subscription with null token
- [ ] Test display of items with missing expiry/strike for F&O
- [ ] Test filter by instrument type (equity/futures/options/MCX)

## Error Monitoring

**Console Warnings to Monitor**:
1. `⚠️ [WS-PROVIDER] WatchlistItem missing token` - Item won't get live prices
2. `⚠️ [TRANSFORM] WatchlistItem missing token or exchange` - Invalid instrumentId

**Errors to Alert On**:
1. Any `Cannot read property 'toUpperCase' of null` - Missing null check
2. Any `instrumentId is undefined` - Transform issue
3. Any WebSocket subscription failures for valid tokens

## Conclusion

**Current Status**: ✅ **Mostly Safe** - Code handles nulls with optional chaining, but transform functions should add explicit fallbacks for better UX.

**Priority Fixes**:
1. **HIGH**: Add null fallbacks in transform functions
2. **MEDIUM**: Run data migration for existing WatchlistItems
3. **LOW**: Make schema fields non-nullable after migration

**Estimated Risk**: Low to Medium - UI won't crash but may display "UNKNOWN" for existing items without proper data migration.

