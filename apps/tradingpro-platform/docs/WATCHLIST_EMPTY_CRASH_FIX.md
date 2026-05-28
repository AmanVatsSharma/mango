/**
 * @file WATCHLIST_EMPTY_CRASH_FIX.md
 * @module docs
 * @description Fix for client-side crash when watchlists are empty
 * @author BharatERP
 * @created 2025-01-28
 */

# Watchlist Empty Array Crash Fix

## Problem

The dashboard was crashing with a client-side error when visiting the watchlist section, even when watchlists were empty.

## Root Causes

### 1. **Undefined `activeWatchlist` When Array is Empty**
**Location**: `components/watchlist/WatchlistManager.tsx:103`

**Issue**: 
```typescript
const activeWatchlist = useMemo(() => {
  const current = watchlists.find(w => w.id === activeTab)
  return current || watchlists[0]  // ❌ watchlists[0] is undefined when empty!
}, [watchlists, activeTab])
```

When `watchlists` is empty, `watchlists[0]` returns `undefined`, causing `activeWatchlist` to be `undefined`.

### 2. **Accessing `activeWatchlist.items` Without Null Check**
**Location**: `components/watchlist/WatchlistManager.tsx:109`

**Issue**:
```typescript
let items = [...activeWatchlist.items]  // ❌ Crash if activeWatchlist is undefined!
```

### 3. **Sorting with Null Values**
**Location**: `components/watchlist/WatchlistManager.tsx:136-147`

**Issues**:
- `a.symbol.localeCompare(b.symbol)` - crashes if symbol is null/undefined
- `new Date(b.createdAt).getTime()` - crashes if createdAt is null/undefined

### 4. **Setting Tab with Undefined Watchlist**
**Location**: `components/watchlist/WatchlistManager.tsx:276-280`

**Issue**:
```typescript
const defaultWatchlist = watchlists.find(w => w.isDefault) || watchlists[0]
setActiveTab(defaultWatchlist.id)  // ❌ Crash if defaultWatchlist is undefined!
```

### 5. **Missing Null Fallbacks in GraphQL Transform**
**Location**: `lib/hooks/use-enhanced-watchlist.ts:269-274`

**Issue**: Missing fallbacks for nullable fields, causing potential display issues.

## Fixes Applied

### Fix 1: Safe activeWatchlist Calculation
```typescript
const activeWatchlist = useMemo(() => {
  if (watchlists.length === 0) return null  // ✅ Early return
  const current = watchlists.find(w => w.id === activeTab)
  return current || watchlists[0] || null  // ✅ Explicit null fallback
}, [watchlists, activeTab])
```

### Fix 2: Null-Safe Items Access
```typescript
const sortedItems = useMemo(() => {
  if (!activeWatchlist || !activeWatchlist.items) return []  // ✅ Check items exists
  let items = [...(activeWatchlist.items || [])]  // ✅ Extra safety
  // ...
}, [activeWatchlist, sortBy, quotes, instrumentFilter])
```

### Fix 3: Null-Safe Sorting
```typescript
case 'name':
  return (a.symbol || 'UNKNOWN').localeCompare(b.symbol || 'UNKNOWN')  // ✅ Fallback

case 'added':
default:
  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0  // ✅ Null check
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return timeB - timeA
```

### Fix 4: Safe Tab Setting
```typescript
const defaultWatchlist = watchlists.find(w => w.isDefault) || watchlists[0]
if (defaultWatchlist) {  // ✅ Check before using
  setActiveTab(defaultWatchlist.id)
}
```

### Fix 5: GraphQL Transform Null Fallbacks
```typescript
symbol: item.symbol || 'UNKNOWN',  // ✅ Fallback
name: item.name || 'Unknown',  // ✅ Fallback
exchange: item.exchange || 'NSE',  // ✅ Fallback
segment: item.segment || 'NSE',  // ✅ Fallback
```

### Fix 6: Safe Items Collection Access
```typescript
const items = (node.watchlistItemCollection?.edges || []).map(...)  // ✅ Safe array access
```

## Files Modified

1. ✅ `components/watchlist/WatchlistManager.tsx`
   - Added null checks for `activeWatchlist`
   - Added null checks for `activeWatchlist.items`
   - Added null-safe sorting
   - Added null checks before setting tabs

2. ✅ `lib/hooks/use-enhanced-watchlist.ts`
   - Added null fallbacks for symbol, name, exchange, segment
   - Added safe access for `watchlistItemCollection.edges`

## Testing

**Scenarios Tested**:
- ✅ Empty watchlists array
- ✅ Watchlist with null items array
- ✅ Items with null symbol, createdAt
- ✅ Tab switching with empty array

**Expected Behavior**:
- ✅ Component renders empty state UI instead of crashing
- ✅ No client-side errors in console
- ✅ Graceful handling of null/undefined values

## Prevention

**Best Practices Applied**:
1. Always check array length before accessing `array[0]`
2. Use optional chaining: `obj?.property`
3. Provide fallbacks for nullable values
4. Check for null before calling methods: `value?.method()`
5. Use default values: `value || defaultValue`

## Status

✅ **RESOLVED** - All crash scenarios fixed, component now handles empty watchlists gracefully.

