# 🔍 Vortex Session Troubleshooting Flowchart

## Quick Diagnostic Flow

```
┌─────────────────────────────────────────────────────────┐
│ ISSUE: Live prices not showing / NO_SESSION error       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 1: Check Debug Endpoint                            │
│ $ curl http://localhost:3000/api/debug/vortex-session   │
└─────────────────────────────────────────────────────────┘
                        ↓
                ┌───────┴───────┐
                │               │
          [diagnosis]      [diagnosis]
          status:          status:
          HEALTHY          NEEDS_LOGIN
                │               │
                ↓               ↓
    ┌────────────────┐  ┌────────────────┐
    │ Session Valid  │  │ No/Invalid     │
    │ Check Step 2   │  │ Session        │
    └────────────────┘  └────────────────┘
                                 ↓
                        ┌─────────────────┐
                        │ STEP 2:         │
                        │ Check Env Vars  │
                        └─────────────────┘
                                 ↓
                        ┌─────────────────────────────┐
                        │ Has VORTEX_APPLICATION_ID?  │
                        │ Has VORTEX_X_API_KEY?       │
                        └─────────────────────────────┘
                                 ↓
                        ┌────────┴────────┐
                        │                 │
                      [YES]             [NO]
                        │                 │
                        ↓                 ↓
                ┌─────────────┐   ┌──────────────────┐
                │ STEP 3:     │   │ FIX:             │
                │ Login Flow  │   │ Set env vars     │
                └─────────────┘   │ Restart server   │
                        ↓         └──────────────────┘
                ┌─────────────────────────────┐
                │ 1. Visit /admin/vortex-     │
                │    dashboard                │
                │ 2. Click "Login to Vortex"  │
                │ 3. Complete OAuth           │
                └─────────────────────────────┘
                        ↓
                ┌─────────────────────────────┐
                │ STEP 4:                     │
                │ Verify Session Created      │
                └─────────────────────────────┘
                        ↓
        ┌───────────────┴───────────────┐
        │                               │
  [Session Created]              [Login Failed]
        │                               │
        ↓                               ↓
┌────────────────┐            ┌─────────────────────┐
│ STEP 5:        │            │ Check:              │
│ Test API       │            │ - Vortex API status │
│ Endpoint       │            │ - OAuth config      │
└────────────────┘            │ - Network issues    │
        ↓                     └─────────────────────┘
┌──────────────────────────┐
│ $ curl 'http://localhost │
│ :3000/api/quotes?q=NSE   │
│ _EQ-26000&mode=ltp'      │
└──────────────────────────┘
        ↓
┌───────┴────────┐
│                │
[Success]    [Error]
│                │
↓                ↓
┌─────────┐  ┌─────────────────┐
│ ✅ FIXED │  │ Check console   │
│         │  │ logs for errors │
└─────────┘  └─────────────────┘
```

## Step-by-Step Troubleshooting Guide

### 1️⃣ Run Diagnostic Check
```bash
curl http://localhost:3000/api/debug/vortex-session | jq
```

**Look for:**
- `diagnosis.status`: Should be "HEALTHY"
- `database.totalSessions`: Should be > 0
- `vortexAPI.isSessionValid`: Should be `true`

### 2️⃣ Check Environment Variables
```bash
# Check if variables are set
echo "VORTEX_APPLICATION_ID: $VORTEX_APPLICATION_ID"
echo "VORTEX_X_API_KEY: $VORTEX_X_API_KEY"
```

**Expected:**
- Both should have values (not empty)
- VORTEX_APPLICATION_ID should be your Vortex app ID
- VORTEX_X_API_KEY should be your Vortex API key

**If missing:**
1. Add to `.env` file:
   ```env
   VORTEX_APPLICATION_ID=your_app_id
   VORTEX_X_API_KEY=your_api_key
   ```
2. Restart dev server: `npm run dev`

### 3️⃣ Login to Vortex
**Steps:**
1. Open browser: `http://localhost:3000/admin/vortex-dashboard`
2. Click "Login to Vortex" button
3. Complete OAuth authentication
4. Should redirect back to dashboard
5. Check for success message

**Console logs to watch:**
```
[VORTEX_AUTH] Admin login attempt initiated
[VORTEX_AUTH] Callback received
[VORTEX_AUTH] Token exchange successful
[VORTEX_AUTH] Session created successfully
```

### 4️⃣ Verify Session in Database
```bash
curl http://localhost:3000/api/debug/vortex-session | jq '.data.database.latestSession'
```

**Expected output:**
```json
{
  "id": 1,
  "userId": 1,
  "createdAt": "2025-10-07T...",
  "updatedAt": "2025-10-07T...",
  "hasAccessToken": true,
  "accessTokenPreview": "abc123..."
}
```

### 5️⃣ Test Quotes API
```bash
# Test with NIFTY 50 index
curl 'http://localhost:3000/api/quotes?q=NSE_EQ-26000&mode=ltp'
```

**Expected output:**
```json
{
  "success": true,
  "data": {
    "NSE_EQ-26000": {
      "ltp": 19500.50,
      ...
    }
  }
}
```

**If you get NO_SESSION error:**
- Check console logs for detailed error
- Run diagnostic endpoint again
- Verify session exists in database
- Try logging in again

### 6️⃣ Test WebSocket Connection
```bash
curl http://localhost:3000/api/ws
```

**Expected output:**
```json
{
  "success": true,
  "data": {
    "url": "wss://wire.rupeezy.in/ws?auth_token=...",
    "sessionId": 1
  }
}
```

### 7️⃣ Check Dashboard Live Quotes
1. Navigate to: `http://localhost:3000/admin/dashboard`
2. Scroll to "Live Market Quotes" section
3. Should see WebSocket status: "Connected"
4. Should see live prices updating

**Console logs to watch:**
```
[LiveMarketQuotes] Component rendering
[LiveMarketQuotes] WebSocket State: connected
[LiveMarketQuotes] Subscribing to market instruments
[LiveMarketQuotes] Price update received
```

## Common Error Patterns

### Error: "NO_SESSION"
**Symptoms:** API returns `{"error": "No active session...", "code": "NO_SESSION"}`

**Causes:**
1. User hasn't logged into Vortex
2. Session was cleared/expired
3. Database connection issue

**Solutions:**
1. Login to Vortex (Step 3)
2. Check database for sessions
3. Verify Prisma connection

### Error: "CONFIG_ERROR"
**Symptoms:** Error about missing configuration

**Causes:**
1. Environment variables not set
2. Server not restarted after .env change

**Solutions:**
1. Set env vars (Step 2)
2. Restart server: `npm run dev`

### Error: "SESSION_ERROR"
**Symptoms:** Database query fails

**Causes:**
1. Prisma client not generated
2. Database not migrated
3. Connection string issues

**Solutions:**
```bash
npx prisma generate
npx prisma migrate deploy
```

### Error: "TOKEN_EXCHANGE_FAILED"
**Symptoms:** OAuth callback fails

**Causes:**
1. Invalid OAuth token
2. Vortex API down
3. Network issues
4. Wrong credentials

**Solutions:**
1. Check Vortex API status
2. Verify credentials in .env
3. Try logging in again
4. Check network/firewall

## Diagnostic Console Logs

### ✅ Healthy Session Flow
```
🔧 [VortexAPI] Instance created: { isBuildTime: false, hasAppId: true, hasApiKey: true }
🔐 [VortexAPI] Ensuring valid session... { hasCachedSession: false, cachedSessionId: undefined }
⚡ [VortexAPI] No cached session, fetching from database...
🔍 [VortexAPI] Fetching session from database...
✅ [VortexAPI] Session found and cached: { sessionId: 1, userId: 1, createdAt: '...', hasAccessToken: true }
🔎 [VortexAPI] Checking if session is valid...
✅ [VortexAPI] Session is valid
🔐 [API/Quotes] Validating Vortex session...
✅ [API/Quotes] Session is valid, proceeding to fetch quotes
```

### ❌ No Session Flow
```
🔧 [VortexAPI] Instance created: { isBuildTime: false, hasAppId: true, hasApiKey: true }
🔐 [VortexAPI] Ensuring valid session... { hasCachedSession: false, cachedSessionId: undefined }
⚡ [VortexAPI] No cached session, fetching from database...
🔍 [VortexAPI] Fetching session from database...
⚠️ [VortexAPI] No session found in database
❌ [VortexAPI] No active session found. User needs to login.
🔎 [VortexAPI] Checking if session is valid...
❌ [VortexAPI] Session validation failed: No active session found. Please login again.
🔐 [API/Quotes] Validating Vortex session...
❌ [API/Quotes] No valid session found
```

## Quick Commands Reference

```bash
# 1. Check session status
curl http://localhost:3000/api/debug/vortex-session | jq

# 2. Test quotes API
curl 'http://localhost:3000/api/quotes?q=NSE_EQ-26000&mode=ltp' | jq

# 3. Test WebSocket info
curl http://localhost:3000/api/ws | jq

# 4. Check environment
echo "APP_ID: $VORTEX_APPLICATION_ID"
echo "API_KEY: ${VORTEX_X_API_KEY:0:20}..."

# 5. Restart server
npm run dev

# 6. Check database
npx prisma studio
# Navigate to VortexSession table

# 7. View logs in real-time
# Just watch the terminal running npm run dev
```

## Support Checklist

Before asking for help, ensure:
- [ ] Ran diagnostic endpoint
- [ ] Checked environment variables
- [ ] Tried logging in to Vortex
- [ ] Verified session in database
- [ ] Tested API endpoints
- [ ] Reviewed console logs
- [ ] Restarted dev server
- [ ] Checked Vortex API status (external)

## Contact

If all steps fail:
1. Copy diagnostic endpoint output
2. Copy console logs (last 50 lines)
3. Copy error messages
4. Provide to support team

---

**Last Updated:** 2025-10-07