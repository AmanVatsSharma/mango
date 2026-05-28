/**
 * @file realtime.ts
 * @module realtime-types
 * @description Type definitions for Server-Sent Events (SSE) realtime system
 * @author StockTrade
 * @created 2025-01-27
 */

/**
 * Realtime event types emitted by the system
 */
export type RealtimeEventType =
  | 'order_placed'
  | 'order_executed'
  | 'order_cancelled'
  | 'position_opened'
  | 'position_closed'
  | 'position_updated'
  | 'positions_pnl_updated'
  | 'balance_updated'
  | 'margin_blocked'
  | 'margin_released'
  | 'watchlist_updated'
  | 'watchlist_item_added'
  | 'watchlist_item_removed'
  | 'notification_created'
  | 'notification_deleted'
  | 'connected'

/**
 * Base structure for all realtime events
 */
export interface RealtimeEvent {
  event: RealtimeEventType
  data: any
  timestamp: string
  userId: string
}

/**
 * Order-related event data
 */
export interface OrderEventData {
  orderId: string
  symbol: string
  quantity: number
  orderType: string
  orderSide: string
  status: string
  price?: number | null
  tradingAccountId?: string
}

/**
 * Position-related event data
 */
export interface PositionEventData {
  positionId: string
  symbol: string
  quantity: number
  averagePrice: number
  tradingAccountId?: string
  realizedPnL?: number
}

export interface PositionsPnLUpdatedEventData {
  updates: Array<{
    positionId: string
    unrealizedPnL: number
    dayPnL: number
    currentPrice?: number
    /**
     * Day-anchor price used by the worker to compute dayPnL = (currentPrice - prevClose) * quantity.
     * Present when the upstream quote carries a previous-close. Net-view consumers use this to
     * recompute net.dayPnL client-side without a refetch (all lots of the same instrument share prevClose).
     */
    prevClose?: number
    /** Present when `currentPrice` is from a fresh subscription tick (worker-only). */
    quoteReceivedAtMs?: number
    updatedAtMs: number
  }>
}

export interface ConnectedEventData {
  userId: string
  timestamp: string
}

/**
 * Account-related event data
 */
export interface AccountEventData {
  tradingAccountId: string
  balance: number
  availableMargin: number
  usedMargin: number
  balanceChange?: number
  marginChange?: number
}

/**
 * Watchlist-related event data
 */
export interface WatchlistEventData {
  watchlistId: string
  action: 'item_added' | 'item_removed' | 'item_updated'
  itemId?: string
  userId: string
}

/**
 * Notification event data — fan-out by `target` happens in middleware (per-user emit).
 * Clients receive the notification id + summary; full record is fetched lazily if needed.
 */
export interface NotificationEventData {
  notificationId: string
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  createdAt: string
}

/**
 * SSE message format sent to clients
 */
export interface SSEMessage {
  event: RealtimeEventType
  data:
    | OrderEventData
    | PositionEventData
    | PositionsPnLUpdatedEventData
    | AccountEventData
    | WatchlistEventData
    | NotificationEventData
    | ConnectedEventData
  timestamp: string
}

