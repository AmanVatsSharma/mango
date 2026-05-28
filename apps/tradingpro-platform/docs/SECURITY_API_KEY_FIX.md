# API Key Security Fix - Market Data Search

## Problem
- API keys were exposed in browser network tab (client-side fetch)
- Direct calls from frontend exposed `x-api-key` header
- Security risk: Anyone could steal API key from browser DevTools

## Solution
✅ **Server-side API Proxy Pattern**

1. Created `/app/api/market-data/search/route.ts` - Server-side proxy
2. Updated `lib/services/market-data/search-client.ts` - Now calls internal proxy
3. API key is **NEVER** sent from client
4. All external API calls happen server-side only

## Environment Variables

### Before (INSECURE - Do NOT use):
```env
NEXT_PUBLIC_MARKET_DATA_API_URL=https://marketdata.vedpragya.com
NEXT_PUBLIC_MARKET_DATA_API_KEY=your-key-here  # ❌ EXPOSED TO CLIENT!
```

### After (SECURE - Required):
```env
# Server-side only (no NEXT_PUBLIC prefix)
MARKET_DATA_API_URL=https://marketdata.vedpragya.com
MARKET_DATA_API_KEY=your-key-here  # ✅ SECURE - Only on server
# OR use existing:
VEDPRAGYA_X_API_KEY=your-key-here  # Also works
```

## How It Works

### Client Request Flow:
```
1. Frontend: searchEquities('RELIANCE')
   ↓
2. Calls: /api/market-data/search?type=equities&q=RELIANCE
   ↓ (No API key in request)
3. Server Proxy: Adds x-api-key header
   ↓
4. External API: https://marketdata.vedpragya.com/api/stock/vayu/equities
   ↓
5. Response: Returns to client (through proxy)
```

### Security Benefits:
- ✅ API key never leaves server
- ✅ Not visible in browser DevTools
- ✅ Not in client-side JavaScript bundle
- ✅ Can add rate limiting per user
- ✅ Can add authentication checks

## Migration Steps

1. **Update `.env.local` (remove NEXT_PUBLIC prefix):**
   ```env
   # Remove these (if exists):
   # NEXT_PUBLIC_MARKET_DATA_API_URL=...
   # NEXT_PUBLIC_MARKET_DATA_API_KEY=...
   
   # Add these (server-side only):
   MARKET_DATA_API_URL=https://marketdata.vedpragya.com
   MARKET_DATA_API_KEY=your-actual-api-key
   ```

2. **Restart Next.js dev server** after changing env vars

3. **Test the search functionality:**
   - Check browser Network tab - should see calls to `/api/market-data/search`
   - API key should NOT appear in request headers
   - Search should work normally

## API Endpoints Supported

All search types work through the proxy:

- ✅ `/api/market-data/search?type=equities&q=RELIANCE`
- ✅ `/api/market-data/search?type=futures&q=NIFTY`
- ✅ `/api/market-data/search?type=options&q=NIFTY&option_type=CE`
- ✅ `/api/market-data/search?type=commodities&q=GOLD`
- ✅ `/api/market-data/search?type=universal&q=RELIANCE`

## Error Handling

- Network errors are caught and returned with proper status codes
- Timeout protection (10 seconds)
- Proper error messages without exposing sensitive data

## Testing

After migration, verify:
1. ✅ Search works (equities, futures, options, commodities)
2. ✅ Browser Network tab shows `/api/market-data/search` calls
3. ✅ No `x-api-key` header visible in client requests
4. ✅ Server logs show successful proxy forwarding

---

**Created**: 2025-01-29  
**Security Level**: 🔒 HIGH - API keys are now secure
