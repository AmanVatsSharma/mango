/**
 * @file prisma-middleware.ts
 * @module prisma-middleware
 * @description Prisma middleware for detecting database changes and emitting realtime events
 * @author StockTrade
 * @created 2025-01-27
 */

import { Prisma } from '@prisma/client'
import { getRealtimeEventEmitter } from './services/realtime/RealtimeEventEmitter'
import type { OrderEventData, PositionEventData, AccountEventData, WatchlistEventData, NotificationEventData } from '@/types/realtime'
import {
  normalizePrismaMiddlewareOptionalNumber,
  normalizePrismaMiddlewareRequiredNumber,
} from '@/lib/server/prisma-middleware-number-utils'

const eventEmitter = getRealtimeEventEmitter()
const POSITION_PNL_ONLY_UPDATE_FIELDS = new Set(["unrealizedPnL", "dayPnL"])

function isPnlOnlyPositionUpdate(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false
  const keys = Object.keys(data as Record<string, unknown>)
  if (keys.length === 0) return false
  return keys.every((key) => POSITION_PNL_ONLY_UPDATE_FIELDS.has(key))
}

/**
 * Cache to store tradingAccountId -> userId mappings
 * This avoids repeated database queries
 */
const accountIdToUserIdCache = new Map<string, string>()

/**
 * Get userId from tradingAccountId
 * Uses cache to avoid repeated database queries
 */
async function getUserIdFromTradingAccountId(
  prisma: any,
  tradingAccountId: string
): Promise<string | null> {
  // Check cache first
  if (accountIdToUserIdCache.has(tradingAccountId)) {
    return accountIdToUserIdCache.get(tradingAccountId) || null
  }

  try {
    // Fetch from database
    const account = await prisma.tradingAccount.findUnique({
      where: { id: tradingAccountId },
      select: { userId: true }
    })

    if (account?.userId) {
      accountIdToUserIdCache.set(tradingAccountId, account.userId)
      return account.userId
    }
  } catch (error) {
    console.error(`❌ [PRISMA-MIDDLEWARE] Error fetching userId for tradingAccountId ${tradingAccountId}:`, error)
  }

  return null
}

/**
 * Prisma middleware using $use
 * Catches database changes and emits realtime events
 * Note: We need a reference to the base prisma client, not the extended one
 */
export function setupRealtimeMiddleware(prisma: any) {
  // Check if $use is available
  if (typeof prisma.$use !== 'function') {
    console.error('❌ [PRISMA-MIDDLEWARE] $use is not available on Prisma client instance')
    console.error('❌ [PRISMA-MIDDLEWARE] Prisma client type:', typeof prisma, 'Has $use:', '$use' in prisma)
    return // Exit early if $use is not available
  }

  prisma.$use(async (params: any, next: any) => {
    // For WatchlistItem delete, we need to fetch watchlistId BEFORE deletion
    if (params.model === 'WatchlistItem' && params.action === 'delete') {
      try {
        const itemId = params.args?.where?.id
        
        if (itemId) {
          const watchlistItem = await prisma.watchlistItem.findUnique({
            where: { id: itemId },
            select: { watchlistId: true }
          })

          if (watchlistItem?.watchlistId) {
            const watchlist = await prisma.watchlist.findUnique({
              where: { id: watchlistItem.watchlistId },
              select: { userId: true }
            })

            // Execute the delete
            const result = await next(params)

            // Emit event after successful delete
            if (watchlist?.userId) {
              const eventData: WatchlistEventData = {
                watchlistId: watchlistItem.watchlistId,
                action: 'item_removed',
                itemId: itemId,
                userId: watchlist.userId
              }

              console.log(`📤 [PRISMA-MIDDLEWARE] Emitting watchlist_item_removed for user ${watchlist.userId}`)
              eventEmitter.emit(watchlist.userId, 'watchlist_item_removed', eventData)
            }

            return result
          }
        }
      } catch (error) {
        console.error(`❌ [PRISMA-MIDDLEWARE] Error in WatchlistItem delete middleware:`, error)
      }
    }

    const result = await next(params)

    // Order events
    if (params.model === 'Order') {
      if (params.action === 'create') {
        // Get userId from tradingAccountId
        const userId = await getUserIdFromTradingAccountId(prisma, result.tradingAccountId)
        
        if (userId) {
          const eventData: OrderEventData = {
            orderId: result.id,
            symbol: result.symbol,
            quantity: result.quantity,
            orderType: result.orderType,
            orderSide: result.orderSide,
            status: result.status,
            price: normalizePrismaMiddlewareOptionalNumber(result.price),
            tradingAccountId: result.tradingAccountId
          }

          console.log(`📤 [PRISMA-MIDDLEWARE] Emitting order_placed for user ${userId}`)
          eventEmitter.emit(userId, 'order_placed', eventData)
        }
      } else if (params.action === 'update') {
        // Get userId from tradingAccountId
        const userId = await getUserIdFromTradingAccountId(prisma, result.tradingAccountId)
        
        if (userId && result.status) {
          if (result.status === 'EXECUTED') {
            const eventData: OrderEventData = {
              orderId: result.id,
              symbol: result.symbol,
              quantity: result.quantity,
              orderType: result.orderType,
              orderSide: result.orderSide,
              status: result.status,
              price: normalizePrismaMiddlewareOptionalNumber(result.averagePrice),
              tradingAccountId: result.tradingAccountId
            }

            console.log(`📤 [PRISMA-MIDDLEWARE] Emitting order_executed for user ${userId}`)
            eventEmitter.emit(userId, 'order_executed', eventData)
          } else if (result.status === 'CANCELLED') {
            const eventData: OrderEventData = {
              orderId: result.id,
              symbol: result.symbol,
              quantity: result.quantity,
              orderType: result.orderType,
              orderSide: result.orderSide,
              status: result.status,
              price: null,
              tradingAccountId: result.tradingAccountId
            }

            console.log(`📤 [PRISMA-MIDDLEWARE] Emitting order_cancelled for user ${userId}`)
            eventEmitter.emit(userId, 'order_cancelled', eventData)
          }
        }
      }
    }

    // Position events
    if (params.model === 'Position') {
      if (params.action === 'create') {
        const userId = await getUserIdFromTradingAccountId(prisma, result.tradingAccountId)
        
        if (userId) {
          const eventData: PositionEventData = {
            positionId: result.id,
            symbol: result.symbol,
            quantity: result.quantity,
            averagePrice: normalizePrismaMiddlewareRequiredNumber(result.averagePrice),
            tradingAccountId: result.tradingAccountId
          }

          console.log(`📤 [PRISMA-MIDDLEWARE] Emitting position_opened for user ${userId}`)
          eventEmitter.emit(userId, 'position_opened', eventData)
        }
      } else if (params.action === 'update') {
        const userId = await getUserIdFromTradingAccountId(prisma, result.tradingAccountId)
        
        if (userId) {
          const isPnlOnlyUpdate = isPnlOnlyPositionUpdate(params.args?.data)
          // Check if position was closed (quantity becomes 0)
          const isClosed = result.quantity === 0 || (params.args?.data?.quantity === 0)
          
          if (isClosed) {
            const eventData: PositionEventData = {
              positionId: result.id,
              symbol: result.symbol,
              quantity: 0,
              averagePrice: normalizePrismaMiddlewareRequiredNumber(result.averagePrice),
              tradingAccountId: result.tradingAccountId,
              realizedPnL:
                normalizePrismaMiddlewareOptionalNumber(result.unrealizedPnL) ?? undefined
            }

            console.log(`📤 [PRISMA-MIDDLEWARE] Emitting position_closed for user ${userId}`)
            eventEmitter.emit(userId, 'position_closed', eventData)
          } else if (!isPnlOnlyUpdate) {
            const eventData: PositionEventData = {
              positionId: result.id,
              symbol: result.symbol,
              quantity: result.quantity,
              averagePrice: normalizePrismaMiddlewareRequiredNumber(result.averagePrice),
              tradingAccountId: result.tradingAccountId
            }

            console.log(`📤 [PRISMA-MIDDLEWARE] Emitting position_updated for user ${userId}`)
            eventEmitter.emit(userId, 'position_updated', eventData)
          } else {
            console.debug(
              `🧮 [PRISMA-MIDDLEWARE] Skipping position_updated emit for PnL-only update ${result.id}`,
            )
          }
        }
      }
    }

    // TradingAccount events (balance updates)
    if (params.model === 'TradingAccount' && params.action === 'update') {
      if (result.userId) {
        // Check if balance/margin changed
        const balanceChanged = params.args?.data?.balance !== undefined
        const marginChanged = params.args?.data?.availableMargin !== undefined || params.args?.data?.usedMargin !== undefined
        
        if (balanceChanged || marginChanged) {
          const eventData: AccountEventData = {
            tradingAccountId: result.id,
            balance: result.balance,
            availableMargin: result.availableMargin,
            usedMargin: result.usedMargin
          }

          console.log(`📤 [PRISMA-MIDDLEWARE] Emitting balance_updated for user ${result.userId}`)
          eventEmitter.emit(result.userId, 'balance_updated', eventData)
        }
      }
    }

    // Watchlist events
    if (params.model === 'Watchlist' && params.action === 'update') {
      if (result.userId) {
        console.log(`📤 [PRISMA-MIDDLEWARE] Emitting watchlist_updated for user ${result.userId}`)
        eventEmitter.emit(result.userId, 'watchlist_updated', {
          watchlistId: result.id,
          action: 'item_updated' as const,
          userId: result.userId
        })
      }
    }

    // Notification events — fan out by `target`. SPECIFIC → per-userId emit; ALL/USERS/ADMINS → broadcast.
    // Drives the SSE-based notifications hook so the UI no longer needs 30s polling.
    if (params.model === 'Notification' && params.action === 'create') {
      try {
        const eventData: NotificationEventData = {
          notificationId: result.id,
          title: result.title,
          message: result.message,
          type: result.type,
          priority: result.priority,
          createdAt: (result.createdAt instanceof Date ? result.createdAt.toISOString() : String(result.createdAt)),
        }

        const target: string = result.target ?? 'ALL'
        const targetUserIds: string[] = Array.isArray(result.targetUserIds) ? result.targetUserIds : []

        if (target === 'SPECIFIC' && targetUserIds.length > 0) {
          targetUserIds.forEach((uid) => {
            if (typeof uid === 'string' && uid.length > 0) {
              eventEmitter.emit(uid, 'notification_created', eventData)
            }
          })
        } else {
          // ALL / USERS / ADMINS — every connected client; client-side filtering by role if needed
          eventEmitter.emitBroadcast('notification_created', eventData)
        }
      } catch (error) {
        console.error('❌ [PRISMA-MIDDLEWARE] Error emitting notification_created:', error)
      }
    }

    // WatchlistItem events (create only - delete handled above before next())
    if (params.model === 'WatchlistItem' && params.action === 'create') {
      // Get userId from watchlist relation
      try {
        const watchlist = await prisma.watchlist.findUnique({
          where: { id: result.watchlistId },
          select: { userId: true }
        })

        if (watchlist?.userId) {
          const eventData: WatchlistEventData = {
            watchlistId: result.watchlistId,
            action: 'item_added',
            itemId: result.id,
            userId: watchlist.userId
          }

          console.log(`📤 [PRISMA-MIDDLEWARE] Emitting watchlist_item_added for user ${watchlist.userId}`)
          eventEmitter.emit(watchlist.userId, 'watchlist_item_added', eventData)
        }
      } catch (error) {
        console.error(`❌ [PRISMA-MIDDLEWARE] Error fetching watchlist userId:`, error)
      }
    }

    return result
  })
}

console.log('✅ [PRISMA-MIDDLEWARE] Module initialized')

