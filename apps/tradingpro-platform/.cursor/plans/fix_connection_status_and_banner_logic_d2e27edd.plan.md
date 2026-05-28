---
name: Fix Connection Status and Banner Logic
overview: Standardize connection status logic across the application to rely on WebSocket connection state rather than browser network events. This will resolve the discrepancy between the "market offline" banner and the actual data flow, and fix the red WiFi icon in the header.
todos:
  - id: update-enhanced-header
    content: Update `components/enhanced-header.tsx` to use `useMarketData` for connection status.
    status: completed
  - id: update-clean-header
    content: Update `components/clean-header.tsx` to use `useMarketData` for connection status.
    status: completed
  - id: update-dashboard-banner
    content: Update `components/trading/TradingDashboard.tsx` banner logic and refresh handler.
    status: completed
isProject: false
---

# Fix Connection Status and Banner Logic

## Goal

Resolve the issue where the "market is offline" banner appears and the WiFi icon shows disconnected despite live data flowing. Standardize connection status logic across all components.

## Analysis

The current implementation has inconsistent connection checks:

- `TradingDashboard` uses `useMarketData().isConnected` (WebSocket state).
- `enhanced-header.tsx` and `clean-header.tsx` use `window.online` (Browser network state).
- The banner in `TradingDashboard` shows when `!isWebSocketConnected`.
- The "Refresh" button in the banner only refreshes trading data (orders/positions) but doesn't attempt to reconnect the WebSocket.

The root cause is likely a mismatch between the `isConnected` state reported by the WebSocket provider and the actual connection status, or the UI components using different sources of truth.

## Steps

1. **Standardize Header Connection Logic**:
  - Modify `components/enhanced-header.tsx` and `components/clean-header.tsx` to use the `useMarketData` hook.
  - Replace the `window.addEventListener('online')` logic with `wsConnectionState === 'connected'`.
2. **Improve Banner Logic in `TradingDashboard.tsx**`:
  - Update the banner condition to be more robust. It should only show if `wsConnectionState` is `'disconnected'` or `'error'`, not just `!connected` (which includes `'connecting'`).
  - Update the "Refresh" button to call `reconnect()` from `useMarketData` in addition to `refreshAll()`.
3. **Verify WebSocket Provider State**:
  - Check `lib/market-data/providers/WebSocketMarketDataProvider.tsx` to ensure `isConnected` correctly reflects the socket state.
  - Ensure the `reconnect` function is exposed and working.
4. **UI Consistency**:
  - Ensure the WiFi icon in the header uses the same color/state logic as the dashboard.

## Implementation Details

### `components/enhanced-header.tsx` & `components/clean-header.tsx`

```typescript
import { useMarketData } from "@/lib/market-data/providers/WebSocketMarketDataProvider"

// Inside component
const { isConnected } = useMarketData()
const isOnline = isConnected === 'connected'
```

### `components/trading/TradingDashboard.tsx`

```typescript
const { reconnect } = useMarketData()

const handleRefreshAllData = useCallback(async () => {
  reconnect() // Add this
  await refreshAll()
  // ...
}, [refreshAll, reconnect])
```

## Verification

- Disconnect network -> Banner should appear, WiFi icon red.
- Reconnect network -> Banner should disappear, WiFi icon green.
- Click "Refresh" -> Should attempt WebSocket reconnection.

