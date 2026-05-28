/**
 * File:        lib/hooks/use-realtime-trading.ts
 * Module:      Trading · Realtime Hooks
 * Purpose:     Coordinator over orders/positions/account hooks; provides optimistic-update handlers and a single refreshAll.
 *
 * Exports:
 *   - useRealtimeTrading(userId) → { orders, positions, account, isLoading*, errors, refresh*, handleOrderPlaced, handlePositionClosed, handleFundOperation, mutate* }
 *
 * Depends on:
 *   - ./use-realtime-orders | use-realtime-positions | use-realtime-account — slice hooks
 *
 * Side-effects:
 *   - Triggers slice mutates via the patch handlers; does NOT schedule its own background polling
 *
 * Key invariants:
 *   - Server SSE events (order_placed/executed/cancelled, position_*, balance/margin_*) are the source of truth
 *   - Optimistic patches are best-effort UX; slice hooks (use-realtime-orders/positions/account) patch caches in-place from the SSE payload
 *   - No setTimeout-driven refreshes — drift is bounded by SSE delivery + revalidateOnFocus/Reconnect + provider's `connected`-event recovery
 *
 * Read order:
 *   1. useRealtimeTrading — composes orders/positions/account
 *   2. handleOrderPlaced / handlePositionClosed / handleFundOperation — optimistic patches only
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

"use client"

import { useCallback } from 'react'
import { useRealtimeOrders } from './use-realtime-orders'
import { useRealtimePositions } from './use-realtime-positions'
import { useRealtimeAccount } from './use-realtime-account'

// Types
interface OrderData {
  symbol: string
  quantity: number
  orderType: string
  orderSide: string
  price?: number
  productType?: string
}

interface OrderResult {
  orderId: string
  marginBlocked?: number
  chargesDeducted?: number
  success?: boolean
  error?: string
}

interface PositionResult {
  marginReleased?: number
  realizedPnL?: number
  success?: boolean
  error?: string
}

interface FundResult {
  success?: boolean
  error?: string
}

export function useRealtimeTrading(userId: string | undefined | null) {
  const orders = useRealtimeOrders(userId)
  const positions = useRealtimePositions(userId)
  const account = useRealtimeAccount(userId)

  // Coordinated refresh - refresh everything with error handling
  const refreshAll = useCallback(async () => {
    console.log("🔄 [REALTIME-TRADING] Refreshing all data")
    try {
      const results = await Promise.allSettled([
        orders.refresh(),
        positions.refresh(),
        account.refresh()
      ])
      
      // Log any failures
      results.forEach((result, index) => {
        const names = ['orders', 'positions', 'account']
        if (result.status === 'rejected') {
          console.error(`❌ [REALTIME-TRADING] Failed to refresh ${names[index]}:`, result.reason)
        }
      })
      
      // Check if all failed
      const allFailed = results.every(r => r.status === 'rejected')
      if (allFailed) {
        throw new Error('Failed to refresh all data')
      }
      
      console.log("✅ [REALTIME-TRADING] Refresh completed")
    } catch (error) {
      console.error("❌ [REALTIME-TRADING] Refresh all failed:", error)
      throw error
    }
  }, [orders, positions, account])

  // Handle order placement with optimistic updates and error handling
  const handleOrderPlaced = useCallback(async (orderData: OrderData, result: OrderResult) => {
    try {
      // Validate inputs
      if (!orderData || typeof orderData !== 'object') {
        throw new Error('Invalid order data')
      }
      
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid order result')
      }
      
      if (!result.orderId) {
        throw new Error('Order result missing orderId')
      }
      
      console.log("🎉 [REALTIME-TRADING] Order placed, updating UI optimistically")
      
      // 1. Add order to orders list (optimistic)
      try {
        // Spread first so explicit fields (id, status, createdAt) win over orderData defaults.
        orders.optimisticUpdate({
          ...orderData,
          id: result.orderId,
          symbol: orderData.symbol,
          quantity: orderData.quantity,
          orderType: orderData.orderType,
          orderSide: orderData.orderSide,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        })
      } catch (error) {
        console.error('❌ [REALTIME-TRADING] Failed to update orders optimistically:', error)
      }

      // 2. Block margin (optimistic) - with validation
      if (result.marginBlocked && typeof result.marginBlocked === 'number' && result.marginBlocked > 0) {
        try {
          account.optimisticBlockMargin(result.marginBlocked)
        } catch (error) {
          console.error('❌ [REALTIME-TRADING] Failed to block margin optimistically:', error)
        }
      }

      // 3. Deduct charges (optimistic) - with validation
      if (result.chargesDeducted && typeof result.chargesDeducted === 'number' && result.chargesDeducted > 0) {
        try {
          account.optimisticUpdateBalance(-result.chargesDeducted, -result.chargesDeducted)
        } catch (error) {
          console.error('❌ [REALTIME-TRADING] Failed to deduct charges optimistically:', error)
        }
      }

      // No timed refetches — order_placed/executed/cancelled SSE events patch the orders cache in-place
      // (use-realtime-orders.ts), and balance changes are patched by the account hook via balance_updated.
      console.log("✅ [REALTIME-TRADING] Order placement handled successfully")
      return result
    } catch (error) {
      console.error("❌ [REALTIME-TRADING] Error handling order placement:", error)
      // Still try to refresh to get accurate state
      refreshAll().catch(err => {
        console.error('❌ [REALTIME-TRADING] Recovery refresh failed:', err)
      })
      throw error
    }
  }, [orders, account, positions, refreshAll])

  // Handle position close with optimistic updates and error handling
  const handlePositionClosed = useCallback(async (positionId: string, result: PositionResult) => {
    try {
      // Validate inputs
      if (!positionId || typeof positionId !== 'string') {
        throw new Error('Invalid position ID')
      }
      
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid position close result')
      }
      
      console.log("🎉 [REALTIME-TRADING] Position closed, updating UI optimistically")
      
      // 1. Update position (optimistic)
      try {
        positions.optimisticClosePosition(positionId)
      } catch (error) {
        console.error('❌ [REALTIME-TRADING] Failed to close position optimistically:', error)
      }

      // 2. Release margin (optimistic) - with validation
      if (result.marginReleased && typeof result.marginReleased === 'number' && result.marginReleased > 0) {
        try {
          account.optimisticReleaseMargin(result.marginReleased)
        } catch (error) {
          console.error('❌ [REALTIME-TRADING] Failed to release margin optimistically:', error)
        }
      }

      // 3. Update balance with P&L (optimistic) - with validation
      if (result.realizedPnL && typeof result.realizedPnL === 'number') {
        try {
          account.optimisticUpdateBalance(result.realizedPnL, result.realizedPnL)
        } catch (error) {
          console.error('❌ [REALTIME-TRADING] Failed to update balance optimistically:', error)
        }
      }

      // No timed refetch — position_closed SSE event patches the positions cache in-place (lots view)
      // or triggers a 450ms-debounced refetch (net view, since dayPnL needs server aggregation).
      console.log("✅ [REALTIME-TRADING] Position close handled successfully")
      return result
    } catch (error) {
      console.error("❌ [REALTIME-TRADING] Error handling position close:", error)
      // Still try to refresh to get accurate state
      refreshAll().catch(err => {
        console.error('❌ [REALTIME-TRADING] Recovery refresh failed:', err)
      })
      throw error
    }
  }, [positions, account, refreshAll])

  // Handle fund operations with optimistic updates and error handling
  const handleFundOperation = useCallback(async (
    type: 'CREDIT' | 'DEBIT' | 'BLOCK' | 'RELEASE',
    amount: number,
    result: FundResult
  ) => {
    try {
      // Validate inputs
      if (!type || !['CREDIT', 'DEBIT', 'BLOCK', 'RELEASE'].includes(type)) {
        throw new Error('Invalid fund operation type')
      }
      
      if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
        throw new Error('Invalid amount')
      }
      
      if (amount <= 0) {
        throw new Error('Amount must be positive')
      }
      
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid operation result')
      }
      
      console.log("🎉 [REALTIME-TRADING] Fund operation completed, updating UI optimistically")
      console.log(`💰 [REALTIME-TRADING] Operation: ${type}, Amount: ${amount}`)
      
      try {
        switch (type) {
          case 'CREDIT':
            account.optimisticUpdateBalance(amount, amount)
            break
          case 'DEBIT':
            account.optimisticUpdateBalance(-amount, -amount)
            break
          case 'BLOCK':
            account.optimisticBlockMargin(amount)
            break
          case 'RELEASE':
            account.optimisticReleaseMargin(amount)
            break
        }
      } catch (error) {
        console.error(`❌ [REALTIME-TRADING] Failed to perform ${type} operation optimistically:`, error)
      }

      // No timed refetch — balance_updated/margin_* SSE events deliver server truth shortly.
      console.log("✅ [REALTIME-TRADING] Fund operation handled successfully")
      return result
    } catch (error) {
      console.error("❌ [REALTIME-TRADING] Error handling fund operation:", error)
      // Still try to refresh to get accurate state
      account.refresh().catch(err => {
        console.error('❌ [REALTIME-TRADING] Recovery refresh failed:', err)
      })
      throw error
    }
  }, [account])

  return {
    // Data with null safety
    orders: orders.orders || [],
    positions: positions.positions || [],
    account: account.account || null,
    
    // Loading states
    isLoadingOrders: orders.isLoading,
    isLoadingPositions: positions.isLoading,
    isLoadingAccount: account.isLoading,
    
    // Any loading?
    isLoading: orders.isLoading || positions.isLoading || account.isLoading,
    
    // Errors
    ordersError: orders.error,
    positionsError: positions.error,
    accountError: account.error,
    
    // Any error?
    hasError: !!(orders.error || positions.error || account.error),
    
    // Retry counts
    retryCount: {
      orders: orders.retryCount,
      positions: positions.retryCount,
      account: account.retryCount
    },
    
    // Refresh functions
    refreshOrders: orders.refresh,
    refreshPositions: positions.refresh,
    refreshAccount: account.refresh,
    refreshAll,
    
    // Optimistic update handlers
    handleOrderPlaced,
    handlePositionClosed,
    handleFundOperation,
    
    // Raw mutate functions (advanced use)
    mutateOrders: orders.mutate,
    mutatePositions: positions.mutate,
    mutateAccount: account.mutate,
  }
}
