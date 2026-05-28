# WebSocket Market Data Setup Guide

## ✅ Quick Setup (Everything Works After This)

### Step 1: Create `.env.local` File

Create or edit `.env.local` in the project root:

```bash
# WebSocket Market Data Configuration
# Note: Use base URL only, Socket.IO will automatically append the /market-data namespace
# Use wss:// for HTTPS production, ws:// for local development
NEXT_PUBLIC_LIVE_MARKET_WS_URL=wss://marketdata.vedpragya.com:3000
LIVE_MARKET_WS_API_KEY=your-actual-api-key-here
NEXT_PUBLIC_ENABLE_WS_MARKET_DATA=true

# Keep your existing environment variables below
NEXT_PUBLIC_BASE_URL=https://www.marketpulse360.live
# ... rest of your env vars
```

### Step 2: Install Socket.IO Client

```bash
npm install socket.io-client
```

### Step 3: Test the Connection

```bash
npm run dev
```

Then open the dashboard and check the browser console. You should see:
- `🚀 [TRADING-DASHBOARD] Using WebSocket Market Data Provider`
- `🔌 [WS-PROVIDER] Connecting to WebSocket...`
- `✅ [WS-PROVIDER] Connected successfully`
- `📡 [WS-PROVIDER] Subscribing to instruments [26000, 26009, ...]`
- `📊 [WS-PROVIDER] Price update received`

---

## 📊 Index Token Configuration

**Nifty Token:** 26000  
**BankNifty Token:** 26009 ✅ (Updated)

Both tokens are correctly configured in:
- `lib/market-data/utils/instrumentMapper.ts` (INDEX_INSTRUMENTS)
- `components/trading/TradingDashboard.tsx` (INDEX_CONFIGS)

---

## 🔍 How It Works

### 1. **Provider Selection**
The `TradingDashboardWrapper` checks the environment variable:
- If `NEXT_PUBLIC_ENABLE_WS_MARKET_DATA=true` → Uses WebSocket provider
- If `false` or unset → Uses polling provider (fallback)

### 2. **Auto-Subscription**
The WebSocket provider automatically subscribes to:
- **Nifty** (token: 26000)
- **Bank Nifty** (token: 26009) ✅
- User's watchlist instruments
- User's position instruments

### 3. **Real-Time Updates**
- WebSocket sends live price updates
- Jitter and interpolation provide smooth UX
- Cached prices available during disconnection

### 4. **Connection Handling**
- Auto-reconnection with exponential backoff (5 attempts)
- Heartbeat every 30 seconds
- Comprehensive error logging

---

## 🐛 Troubleshooting

### Connection Not Working?

1. **Check Environment Variables**
   ```bash
   # Run this in terminal
   grep -E "LIVE_MARKET|ENABLE_WS" .env.local
   ```

2. **Check Console Logs**
   - Open browser console (F12)
   - Look for WebSocket connection logs
   - Error messages will show specific issues

3. **Verify WebSocket Server**
   - Ensure `ws://marketdata.vedpragya.com:3000` is running
   - Check API key is correct
   - Verify firewall allows WebSocket connection

### Common Issues

**Issue: "Cannot find module 'socket.io-client'"**
```bash
npm install socket.io-client
```

**Issue: "Connection failed"**
- Check WebSocket server is running
- Verify API key is correct
- Check network/firewall settings

**Issue: "No price updates"**
- Check subscriptions in console logs
- Verify tokens are correct (26000, 26009)
- Check WebSocket server is sending data

---

## 📝 Files Modified

✅ **Updated Files:**
- `lib/market-data/utils/instrumentMapper.ts` - BankNifty token updated to 26009
- `components/trading/TradingDashboard.tsx` - WebSocket integration
- `package.json` - Added socket.io-client
- `.env.example` - Added WebSocket config

✅ **New Files:**
- `lib/market-data/providers/WebSocketMarketDataProvider.tsx`
- `lib/market-data/hooks/useWebSocketMarketData.ts`
- `lib/market-data/services/WebSocketMarketDataService.ts`
- `lib/market-data/services/SocketIOClient.ts`
- `lib/market-data/utils/*` (all utilities)

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Environment variables set in `.env.local`
- [ ] `socket.io-client` installed (`npm install`)
- [ ] Dashboard shows "Using WebSocket Market Data Provider" in console
- [ ] Connection successful (green logs in console)
- [ ] Subscriptions created (logs show instrument tokens)
- [ ] Prices update in real-time on dashboard
- [ ] Nifty shows token 26000
- [ ] BankNifty shows token 26009 ✅

---

## 🚀 Production Deployment

When deploying to production:

1. Set environment variables in your deployment platform
2. Enable the feature flag: `NEXT_PUBLIC_ENABLE_WS_MARKET_DATA=true`
3. Monitor console logs for connection health
4. Check WebSocket server logs for errors

---

## 📞 Support

If you encounter issues:

1. Check browser console for detailed logs
2. Review `WEBSOCKET_INTEGRATION_COMPLETE.md` for architecture
3. See `lib/market-data/README.md` for technical details
4. Check WebSocket server status

---

**Status: ✅ Ready to Use**

Once you set the environment variables and run `npm install`, everything will work with the WebSocket connection!

