/**
 * WebSocket Trading Hook (Optional Upgrade)
 * 
 * Use this instead of polling for true real-time updates:
 * - Instant updates (no 2-3 second delay)
 * - Lower server load (no polling)
 * - Better user experience
 * 
 * Falls back to polling if WebSocket unavailable.
 */

"use client"

import { useEffect, useState, useCallback } from 'react'
import { getWebSocketManager, WebSocketMessage } from '@/lib/services/websocket/WebSocketManager'
import { useRealtimeTrading } from './use-realtime-trading'

export function useWebSocketTrading(userId: string | undefined, enableWebSocket = false) {
  const [isConnected, setIsConnected] = useState(false)
  const wsManager = getWebSocketManager()
  
  // Fallback to polling
  const pollingData = useRealtimeTrading(userId)

  // Connect to WebSocket
  useEffect(() => {
    if (!userId || !enableWebSocket || typeof window === 'undefined') {
      return
    }

    console.log("🔌 [USE-WEBSOCKET-TRADING] Connecting WebSocket for user:", userId)
    
    wsManager.connect(userId)
    
    // Check connection state
    const checkConnection = setInterval(() => {
      setIsConnected(wsManager.isConnected())
    }, 1000)

    return () => {
      clearInterval(checkConnection)
      wsManager.disconnect()
    }
  }, [userId, enableWebSocket, wsManager])

  // Subscribe to order events
  useEffect(() => {
    if (!enableWebSocket || !isConnected) return

    const unsubscribeOrderPlaced = wsManager.on('order_placed', (message: WebSocketMessage) => {
      console.log("📨 [USE-WEBSOCKET-TRADING] Order placed:", message.data)
      pollingData.mutateOrders() // Refresh orders
    })

    const unsubscribeOrderExecuted = wsManager.on('order_executed', (message: WebSocketMessage) => {
      console.log("📨 [USE-WEBSOCKET-TRADING] Order executed:", message.data)
      pollingData.mutateOrders() // Refresh orders
      pollingData.mutatePositions() // Position might be created
    })

    return () => {
      unsubscribeOrderPlaced()
      unsubscribeOrderExecuted()
    }
  }, [enableWebSocket, isConnected, wsManager, pollingData])

  // Subscribe to position events
  useEffect(() => {
    if (!enableWebSocket || !isConnected) return

    const unsubscribePositionClosed = wsManager.on('position_closed', (message: WebSocketMessage) => {
      console.log("📨 [USE-WEBSOCKET-TRADING] Position closed:", message.data)
      pollingData.mutatePositions() // Refresh positions
      pollingData.mutateAccount() // Balance updated
    })

    return () => {
      unsubscribePositionClosed()
    }
  }, [enableWebSocket, isConnected, wsManager, pollingData])

  // Subscribe to balance events
  useEffect(() => {
    if (!enableWebSocket || !isConnected) return

    const unsubscribeBalanceUpdated = wsManager.on('balance_updated', (message: WebSocketMessage) => {
      console.log("📨 [USE-WEBSOCKET-TRADING] Balance updated:", message.data)
      pollingData.mutateAccount() // Refresh account
    })

    return () => {
      unsubscribeBalanceUpdated()
    }
  }, [enableWebSocket, isConnected, wsManager, pollingData])

  return {
    ...pollingData,
    isWebSocketConnected: isConnected,
    webSocketState: wsManager.getState(),
  }
}
