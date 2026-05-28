# Watchlist New API Integration - Migration Guide

## Overview

This document describes the migration of the watchlist system to use the new market data API at `http://marketdata.vedpragya.com:3000` for instrument search and discovery, while continuing to use the existing WebSocket connection for live price updates.

## What Changed

### 1. **Search System** ✨
- **Before**: Search through GraphQL queries to Supabase
- **After**: Direct API calls to `http://marketdata.vedpragya.com:3000/api/stock/vayu/{type}`
- **Benefits**: 
  - More comprehensive instrument coverage (Equities, Futures, Options, MCX)
  - Faster search results
  - Real-time last prices in search results
  - Support for all instrument types

### 2. **Instrument Storage** 🔄
- **Before**: Only stock ID stored
- **After**: Hybrid storage with token + metadata
- **Structure**:
  - `token` field in Stock model (instrument token for WebSocket)
  - Essential metadata stored (symbol, exchange, segment, name)
  - F&O fields preserved (strike price, option type, expiry, lot size)

### 3. **WebSocket Integration** 📡
- **Before**: Subscribed using constructed instrumentIds
- **After**: Subscribes using actual instrument tokens from API
- **Flow**:
  1. Stock records contain `token` field
  2. WebSocket extracts tokens from watchlist
  3. Subscribes to tokens directly
  4. Receives live prices matched by token

### 4. **Tab Filtering** 🎯
- **Search Tabs**: Equity, Futures, Options, MCX (separate API endpoints)
- **Watchlist Filter Tabs**: All, Equity, Futures, Options, MCX (client-side filtering)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     USER INTERFACE                       │
├─────────────────────────────────────────────────────────┤
│  Stock Search Component                                  │
│  ├─ Tabs: Equity, Futures, Options, MCX                 │
│  └─ Searches: http://marketdata.vedpragya.com:3000      │
│                                                           │
│  Watchlist Manager                                       │
│  ├─ Filter Tabs: All, Equity, Futures, Options, MCX     │
│  └─ WebSocket: Live price updates                       │
└─────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌────────────────────────┐      ┌────────────────────────┐
│  SEARCH API (New)      │      │  WEBSOCKET (Existing)  │
│  Direct frontend calls │      │  Token subscriptions   │
├────────────────────────┤      ├────────────────────────┤
│ /equities              │      │ ws://marketdata...     │
│ /futures               │      │ subscribe_instruments  │
│ /options               │      │ market_data events     │
│ /commodities           │      └────────────────────────┘
└────────────────────────┘
         │
         ▼
┌────────────────────────┐
│   DATABASE (Prisma)    │
├────────────────────────┤
│ Stock Model:           │
│ - token: Int? @unique  │
│ - symbol, name, etc.   │
│                        │
│ WatchlistItem Model:   │
│ - watchlistId + stockId│
└────────────────────────┘
```

## Key Files

### Created Files

1. **`lib/services/market-data/search-client.ts`**
   - Search API client for all instrument types
   - Functions: searchEquities, searchFutures, searchOptions, searchCommodities
   - Error handling and logging

2. **`lib/hooks/use-instrument-search.ts`**
   - React hook with debounced search
   - Tab-based filtering support
   - Loading states and error handling

3. **`scripts/migrate-watchlists-to-tokens.ts`**
   - Clears existing watchlist items
   - Prepares for fresh start

4. **`docs/WATCHLIST_NEW_API_MIGRATION.md`** (this file)
   - Complete migration documentation

### Modified Files

1. **`prisma/schema.prisma`**
   - Added `token Int? @unique` to Stock model
   - Added `@@index([token])` for performance

2. **`components/stock-search.tsx`**
   - Uses new search hook
   - Added commodities tab
   - Displays token-based results
   - Shows instrument-specific fields (strike, expiry, lot size)

3. **`components/watchlist/WatchlistManager.tsx`**
   - Added instrument type filter tabs
   - Client-side filtering by segment
   - Preserves existing watchlist functionality

4. **`lib/hooks/use-prisma-watchlist.ts`**
   - Updated addStockToWatchlist to handle token format
   - Parses token string: `token:{token}:{symbol}:{exchange}:{segment}:{name}`

5. **`lib/watchlist-transactions.ts`**
   - Creates Stock records from token data
   - Finds existing stocks by token
   - Stores hybrid data (token + metadata)

6. **`lib/market-data/providers/WebSocketMarketDataProvider.tsx`**
   - Extracts tokens from Stock.token field
   - Uses tokens for WebSocket subscription
   - Falls back to instrumentId parsing

7. **`lib/hooks/use-trading-data.ts`**
   - Added token field to watchlist item mapping

8. **`app/api/watchlists/[id]/items/route.ts`**
   - Accepts token-based creation
   - Validates either stockId or token

9. **`lib/services/order/OrderExecutionService.ts`**
   - Recovers or synthesizes missing `Stock` records before placing orders
   - Logs stock recovery and creation events for audit trail

10. **`lib/repositories/OrderRepository.ts`**
    - Exposes stock LTP for cancellation margin fallback

11. **`lib/hooks/use-trading-data.ts`**
    - Sends watchlist metadata (token, segment, lot size) directly for order placement
    - Drops dependency on pre-fetched `Stock` records in the client layer

12. **`components/OrderDialog.tsx`**
    - Normalizes watchlist items into order-ready payloads with graceful fallbacks
    - Builds order requests purely from watchlist metadata (instrumentId/token)

## Search API Endpoints

### Base URL
```
http://marketdata.vedpragya.com:3000
```

### Headers
```javascript
{
  'x-api-key': process.env.NEXT_PUBLIC_MARKET_DATA_API_KEY
}
```

### Endpoints

#### 1. Search Equities
```
GET /api/stock/vayu/equities?q={query}&limit=20&ltp_only=true
```

#### 2. Search Futures
```
GET /api/stock/vayu/futures?q={query}&limit=20&ltp_only=true
```

#### 3. Search Options
```
GET /api/stock/vayu/options?q={query}&option_type={CE|PE}&limit=20&ltp_only=true
```

#### 4. Search Commodities (MCX)
```
GET /api/stock/vayu/commodities?q={query}&limit=20&ltp_only=true
```

### Response Format
```typescript
{
  success: true,
  data: {
    instruments: [
      {
        token: 738561,
        symbol: "RELIANCE",
        name: "Reliance Industries",
        exchange: "NSE_EQ",
        segment: "NSE",
        last_price: 2580.50,
        strike_price?: number,  // For options
        option_type?: "CE" | "PE",  // For options
        expiry_date?: "20241228",  // For F&O
        lot_size?: 50  // For F&O
      }
    ]
  }
}
```

## WebSocket Usage

### Connection
```javascript
URL: ws://marketdata.vedpragya.com:3000/market-data
Headers: { 'x-api-key': API_KEY }
```

### Subscribe
```javascript
socket.emit('subscribe_instruments', {
  instruments: [738561, 11536, ...], // Array of tokens
  mode: 'ltp' // 'ltp' | 'ohlcv' | 'full'
})
```

### Receive Data
```javascript
socket.on('market_data', (data) => {
  const token = data.instrumentToken  // Match with Stock.token
  const price = data.data.last_price
  
  // Update UI with new price
})
```

## Adding Instruments to Watchlist

### Flow

1. User searches for instrument (e.g., "RELIANCE")
2. System calls: `GET /api/stock/vayu/equities?q=RELIANCE`
3. User selects instrument from results
4. System sends to backend:
   ```javascript
   POST /api/watchlists/{id}/items
   {
     token: 738561,
     symbol: "RELIANCE",
     name: "Reliance Industries",
     exchange: "NSE_EQ",
     segment: "NSE"
   }
   ```
5. Backend creates/finds Stock record with token
6. Backend creates WatchlistItem
7. WebSocket subscribes to token
8. User sees live prices

### Token Format

When adding to watchlist, the frontend encodes token data as:
```
token:{token}:{symbol}:{exchange}:{segment}:{name}
```

Example:
```
token:738561:RELIANCE:NSE_EQ:NSE:Reliance Industries Limited
```

## Migration Steps

### 1. Database Migration (Required)

The `token` field must be added to the Stock model. **This step is blocked due to production database drift.**

**Option A: Manual Schema Update**
```sql
ALTER TABLE "Stock" ADD COLUMN "token" INTEGER UNIQUE;
CREATE INDEX "Stock_token_idx" ON "Stock"("token");
```

**Option B: Wait for Prisma Resolution**
- Run: `npx prisma db push` (needs to be approved for production)

### 2. Environment Variables

Add to `.env`:
```env
NEXT_PUBLIC_MARKET_DATA_API_URL=http://marketdata.vedpragya.com:3000
NEXT_PUBLIC_MARKET_DATA_API_KEY=your_api_key_here
```

Or use existing:
```env
VEDPRAGYA_X_API_KEY=your_api_key_here
```

### 3. Clear Existing Watchlists (Optional)

Run migration script to clear old watchlist items:
```bash
npx ts-node scripts/migrate-watchlists-to-tokens.ts
```

Or manually:
```sql
DELETE FROM "WatchlistItem";
```

### 4. Deploy

1. Deploy code changes
2. Apply database migration
3. Test search functionality
4. Test adding instruments
5. Test WebSocket live updates

## Testing Guide

### Test Search

1. Open watchlist page
2. Click search button
3. Switch between tabs (Equity, Futures, Options, MCX)
4. Search for instruments
5. Verify results show token, price, and instrument details

### Test Adding to Watchlist

1. Search for "RELIANCE" in Equity tab
2. Click "+" button on result
3. Verify it appears in watchlist
4. Check browser console for creation logs

### Test WebSocket

1. Add instrument to watchlist
2. Observe WebSocket connection in console
3. Verify subscription to token
4. Verify live price updates

### Test Tab Filtering

1. Add multiple instrument types (equity, future, option, commodity)
2. Switch between filter tabs in watchlist
3. Verify only relevant instruments shown

## Error Handling

### Search Errors
- Network failures: Show user-friendly message
- Empty results: Display "No results" message
- API errors: Log to console, show error toast

### Add Errors
- Stock already exists: Show "Already in watchlist" message
- Network failures: Retry with user prompt
- Token missing: Log error, skip instrument

### WebSocket Errors
- Connection failures: Automatic retry with backoff
- Invalid data: Log warning, skip update
- Missing token: Fallback to instrumentId parsing

## Console Logging

All operations are logged with emoji prefixes:

- 🔍 Search operations
- ✅ Success operations
- ❌ Error operations
- ⚠️ Warnings
- 📊 Market data
- 🔑 Token operations
- 📡 WebSocket operations
- ➕ Add operations
- 🗑️ Delete operations

## Rollback Plan

If issues arise:

1. **Revert code deployment**
2. **Database rollback** (optional):
   ```sql
   DELETE FROM "WatchlistItem" WHERE "stockId" IN (
     SELECT id FROM "Stock" WHERE token IS NOT NULL
   );
   ```
3. **Clear browser cache**
4. **Restart application**

## Success Criteria

✅ Search returns results for all instrument types  
✅ Users can add instruments to watchlist  
✅ Stock records contain tokens and metadata  
✅ WebSocket subscribes using tokens  
✅ Live prices update in UI  
✅ Tab filtering works correctly  
✅ No console errors  
✅ All existing functionality preserved  

## Changelog

- **2025-10-31** — Auto-upsert `Stock` entries during watchlist item creation and add order-execution fallback that rebuilds missing stocks before blocking funds.
- **2025-10-31** — Ensure order cancellation can reuse live `ltp` data by selecting it in repository helpers.
- **2025-10-31** — Orders now flow directly from watchlist metadata (token/instrumentId) without requiring preloaded `Stock` records in the client.

## Support

For issues or questions:
- Check browser console for error logs
- Verify API key is configured correctly
- Ensure WebSocket connection is established
- Check database token field exists

## Future Enhancements

- [ ] Batch search (search all types at once)
- [ ] Search history/cache
- [ ] Favorites/popular instruments
- [ ] Advanced filters (by expiry, strike range, etc.)
- [ ] Export watchlist to CSV
- [ ] Share watchlist with other users
