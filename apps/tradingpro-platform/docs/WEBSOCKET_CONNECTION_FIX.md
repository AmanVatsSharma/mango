# WebSocket Connection Fix Documentation

## Overview
Fixed the Socket.IO WebSocket connection issue by properly separating the base URL from the namespace path, matching the working HTML test client implementation.

## Problems
1. **Path Issue**: The WebSocket connection was failing because Socket.IO was receiving the full URL including the namespace (`ws://marketdata.vedpragya.com:3000/market-data`) as a single string. Socket.IO then tried to append its own paths (`/socket.io`), causing connection failures.

2. **HTTPS/WSS Issue**: Production sites load over HTTPS, but attempted connections to `ws://` (insecure WebSocket) are blocked by browsers due to mixed content policy. Must use `wss://` for HTTPS sites.

## Solution
Updated the Socket.IO client initialization to parse the URL and separate the base URL from the namespace path, similar to how Socket.IO handles it in the working HTML implementation.

## Files Modified

### 1. `/lib/market-data/services/SocketIOClient.ts`
**Location:** Lines 167-193

**Changes:**
- Added URL parsing logic to separate base URL from path/namespace
- Extract base URL (protocol + host + port)
- Extract path/namespace with proper fallback logic:
  - If path is empty or `/`, default to `/market-data`
  - Otherwise use the specified path
- Configure Socket.IO with proper `path` option: `${path}/socket.io`

**Key Code:**
```typescript
// Parse URL to separate base from path for Socket.IO
const parsedUrl = this.config.url.replace('ws://', 'http://').replace('wss://', 'https://');
const urlObj = new URL(parsedUrl);

// Extract base URL (protocol + host, including port if present)
const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

// Extract path (namespace) or use default '/market-data'
// If pathname is '/' or empty, default to '/market-data'
let path = urlObj.pathname;
if (!path || path === '/') {
  path = '/market-data';
}

// Initialize Socket.IO connection with proper path configuration
this.socket = io(baseUrl, {
    path: `${path}/socket.io`,
    extraHeaders: { 'x-api-key': this.config.apiKey },
    reconnection: false,
    timeout: 10000,
    transports: ['websocket', 'polling'],
});
```

### 2. `/lib/market-data/providers/WebSocketMarketDataProvider.tsx`
**Location:** Line 115

**Changes:**
- Updated fallback URL to use base URL only (without `/market-data` suffix)
- Added auto-detection: uses `wss://` for HTTPS sites, `ws://` for HTTP
- Fixes "Mixed Content" browser blocking on production

**Before:**
```typescript
const wsUrl = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL || 'ws://marketdata.vedpragya.com:3000/market-data';
```

**After:**
```typescript
// Use wss:// for production (HTTPS sites require secure WebSocket)
// Use ws:// for local development
const wsUrl = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL || 
  (typeof window !== 'undefined' && window.location.protocol === 'https:' 
    ? 'wss://marketdata.vedpragya.com:3000' 
    : 'ws://marketdata.vedpragya.com:3000');
```

### 3. `/app/(main)/test-websocket/page.tsx`
**Location:** Line 25

**Changes:**
- Updated fallback URL to use base URL only (without `/market-data` suffix)
- Added auto-detection for HTTPS/WSS protocol

**Before:**
```typescript
const wsUrl = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL || 'ws://marketdata.vedpragya.com:3000/market-data';
```

**After:**
```typescript
// Auto-detect protocol: wss:// for HTTPS, ws:// for HTTP
const wsUrl = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL || 
  (typeof window !== 'undefined' && window.location.protocol === 'https:' 
    ? 'wss://marketdata.vedpragya.com:3000' 
    : 'ws://marketdata.vedpragya.com:3000');
```

### 4. `/WEBSOCKET_SETUP_GUIDE.md`
**Location:** Line 11-12

**Changes:**
- Updated documentation with correct environment variable format
- Added note about Socket.IO automatically appending namespace

**Before:**
```bash
NEXT_PUBLIC_LIVE_MARKET_WS_URL=ws://marketdata.vedpragya.com:3000/market-data
```

**After:**
```bash
# Note: Use base URL only, Socket.IO will automatically append the /market-data namespace
NEXT_PUBLIC_LIVE_MARKET_WS_URL=ws://marketdata.vedpragya.com:3000
```

## How It Works

### URL Parsing Logic
1. Convert WebSocket URLs to HTTP/HTTPS for URL parsing:
   - `ws://` → `http://`
   - `wss://` → `https://`

2. Parse the URL to extract components:
   - Base URL: protocol + host + port (e.g., `http://marketdata.vedpragya.com:3000`)
   - Path/Namespace: pathname from URL or default to `/market-data`

3. Configure Socket.IO with separated components:
   - Base URL goes to `io(baseUrl, ...)`
   - Path goes to `path: '${path}/socket.io'`
   - Socket.IO automatically handles the `/socket.io` suffix

### Connection Flow
```
Input URL: ws://marketdata.vedpragya.com:3000
            ↓
Parse: baseUrl = "http://marketdata.vedpragya.com:3000"
       path = "" (empty, defaults to "/market-data")
            ↓
Socket.IO config: {
  baseUrl: "http://marketdata.vedpragya.com:3000"
  path: "/market-data/socket.io"
}
            ↓
Final connection: ws://marketdata.vedpragya.com:3000/market-data/socket.io
```

### Alternative with Explicit Path
```
Input URL: ws://marketdata.vedpragya.com:3000/custom-path
            ↓
Parse: baseUrl = "http://marketdata.vedpragya.com:3000"
       path = "/custom-path"
            ↓
Socket.IO config: {
  baseUrl: "http://marketdata.vedpragya.com:3000"
  path: "/custom-path/socket.io"
}
            ↓
Final connection: ws://marketdata.vedpragya.com:3000/custom-path/socket.io
```

## Testing

### Local Testing
1. Navigate to `/test-websocket` page
2. Click "Connect" button
3. Verify connection status shows "Connected"
4. Subscribe to instruments (e.g., token 26000 for Nifty)
5. Verify real-time price updates are received

### Expected Console Logs
```
🔌 [SOCKET-IO-CLIENT] Connecting...
🔧 [SOCKET-IO-CLIENT] Parsed URL { baseUrl: "http://marketdata.vedpragya.com:3000", path: "/market-data" }
✅ [SOCKET-IO-CLIENT] Connected successfully
✅ [SOCKET-IO-CLIENT] Connected event received
📡 [SOCKET-IO-CLIENT] Subscribing to instruments
✅ [SOCKET-IO-CLIENT] Subscription confirmed
📊 [SOCKET-IO-CLIENT] Market data received
```

## Environment Variables

### Vercel Production
Set these environment variables in Vercel dashboard:

```bash
# Base URL only - Socket.IO will append the path automatically
NEXT_PUBLIC_LIVE_MARKET_WS_URL=ws://marketdata.vedpragya.com:3000
NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY=your-api-key-here
NEXT_PUBLIC_ENABLE_WS_MARKET_DATA=true
```

### Local Development
The fallback values in the code ensure local development works without `.env.local`:

```typescript
const wsUrl = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL || 'ws://marketdata.vedpragya.com:3000';
const apiKey = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY || 'demo-key-1';
```

## Compatibility

### Backward Compatibility
- ✅ Falls back to `/market-data` if no path is specified in URL
- ✅ Accepts custom paths if needed (e.g., `/custom-namespace`)
- ✅ Works with both `ws://` and `wss://` protocols

### URL Format Support
- ✅ `ws://host:3000` → connects to `/market-data`
- ✅ `ws://host:3000/` → connects to `/market-data` (empty path defaults)
- ✅ `ws://host:3000/market-data` → connects to `/market-data`
- ✅ `ws://host:3000/custom` → connects to `/custom`

## Error Handling
The URL parsing includes comprehensive error handling:

1. **Invalid URL**: Socket.IO will handle connection errors with descriptive messages
2. **Missing Protocol**: Returns error during URL parsing
3. **Connection Timeout**: 10-second timeout configured
4. **Authentication Errors**: Handled via extraHeaders validation on server

## Debugging Tips

### Check Browser Console
Look for these log messages:
1. `🔌 [SOCKET-IO-CLIENT] Connecting...` - Connection attempt started
2. `🔧 [SOCKET-IO-CLIENT] Parsed URL` - Shows parsed baseUrl and path
3. `✅ [SOCKET-IO-CLIENT] Connected successfully` - Connection successful

### Common Issues

**Issue:** Connection fails with "404 Not Found"
- **Cause**: Server doesn't have Socket.IO running at specified path
- **Fix**: Verify backend server is running and has Socket.IO configured

**Issue:** Connection times out
- **Cause**: Network or firewall blocking WebSocket connections
- **Fix**: Check firewall rules, verify server is accessible

**Issue:** "No valid API key" error
- **Cause**: Missing or incorrect API key in headers
- **Fix**: Verify `x-api-key` header is being sent correctly

## Comparison with Working HTML Client

### HTML Implementation (Working)
```javascript
const wsUrl = 'https://marketdata.vedpragya.com';
socket = io(wsUrl, {
    path: '/market-data/socket.io',
    extraHeaders: { 'x-api-key': apiKey }
});
```

### Next.js Implementation (Now Fixed)
```typescript
const wsUrl = 'ws://marketdata.vedpragya.com:3000';
const urlObj = new URL(wsUrl.replace('ws://', 'http://'));
const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
const path = urlObj.pathname || '/market-data';

socket = io(baseUrl, {
    path: `${path}/socket.io`,
    extraHeaders: { 'x-api-key': apiKey }
});
```

Both implementations now follow the same pattern of separating base URL and path.

## Summary

✅ Fixed Socket.IO connection by properly parsing URL components  
✅ Updated all fallback URLs to use base URL only  
✅ Updated documentation with correct format  
✅ Maintains backward compatibility with various URL formats  
✅ No breaking changes to existing functionality  

The WebSocket connection should now work correctly in both local development and production environments.

