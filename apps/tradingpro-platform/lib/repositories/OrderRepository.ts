/**
 * Order Repository
 * 
 * Handles all database operations for orders:
 * - Creating orders
 * - Updating order status
 * - Querying orders
 * - Order history
 */

import { prisma } from "@/lib/prisma"
import { Prisma, OrderStatus, OrderType, OrderSide, OrderPurpose } from "@prisma/client"

console.log("📦 [ORDER-REPO] Module loaded")

export interface CreateOrderData {
  tradingAccountId: string
  stockId: string
  symbol: string
  quantity: number
  price: number | null
  orderType: OrderType
  orderSide: OrderSide
  productType: string
  status?: OrderStatus
  orderPurpose?: OrderPurpose
  positionId?: string | null
  closeMetadata?: Prisma.InputJsonValue | null
  failureCode?: string | null
  failureReason?: string | null
  blockedMargin?: number
  placementCharges?: number
  executionContext?: Prisma.InputJsonValue | null
}

export interface UpdateOrderData {
  status?: OrderStatus
  filledQuantity?: number
  averagePrice?: number
  executedAt?: Date
  positionId?: string
  failureCode?: string | null
  failureReason?: string | null
  blockedMargin?: number
  placementCharges?: number
}

export class OrderRepository {
  
  /**
   * Create a new order
   */
  async create(
    data: CreateOrderData,
    tx?: Prisma.TransactionClient
  ) {
    console.log("📦 [ORDER-REPO] Creating order:", {
      symbol: data.symbol,
      quantity: data.quantity,
      orderType: data.orderType,
      orderSide: data.orderSide
    })

    const client = tx || prisma

    const order = await client.order.create({
      data: {
        tradingAccountId: data.tradingAccountId,
        stockId: data.stockId,
        symbol: data.symbol,
        quantity: data.quantity,
        price: data.price,
        orderType: data.orderType,
        orderSide: data.orderSide,
        productType: data.productType,
        status: data.status || OrderStatus.PENDING,
        orderPurpose: data.orderPurpose ?? OrderPurpose.OPEN,
        positionId: data.positionId ?? null,
        closeMetadata: data.closeMetadata === undefined ? undefined : data.closeMetadata,
        failureCode: data.failureCode ?? null,
        failureReason: data.failureReason ?? null,
        blockedMargin: Math.max(0, Math.trunc(data.blockedMargin ?? 0)),
        placementCharges: Math.max(0, Math.trunc(data.placementCharges ?? 0)),
        executionContext: data.executionContext === undefined ? undefined : data.executionContext,
        filledQuantity: 0,
        createdAt: new Date()
      },
      include: {
        tradingAccount: {
          select: {
            id: true,
            userId: true,
            balance: true,
            availableMargin: true
          }
        },
        Stock: {
          select: {
            instrumentId: true,
            segment: true,
            lot_size: true
          }
        }
      }
    })

    console.log("✅ [ORDER-REPO] Order created:", order.id)
    return order
  }

  /**
   * Update order
   */
  async update(
    orderId: string,
    data: UpdateOrderData,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔄 [ORDER-REPO] Updating order:", {
      orderId,
      updates: data
    })

    const client = tx || prisma

    const order = await client.order.update({
      where: { id: orderId },
      data: {
        ...data
      },
      include: {
        Stock: {
          select: {
            instrumentId: true,
            segment: true
          }
        }
      }
    })

    console.log("✅ [ORDER-REPO] Order updated:", orderId)
    return order
  }

  /**
   * Mark order as executed
   */
  async markExecuted(
    orderId: string,
    filledQuantity: number,
    averagePrice: number,
    tx?: Prisma.TransactionClient
  ) {
    console.log("✅ [ORDER-REPO] Marking order as executed:", {
      orderId,
      filledQuantity,
      averagePrice
    })

    return this.update(
      orderId,
      {
        status: OrderStatus.EXECUTED,
        filledQuantity,
        averagePrice,
        executedAt: new Date()
      },
      tx
    )
  }

  /**
   * Mark order as cancelled
   */
  async markCancelled(
    orderId: string,
    tx?: Prisma.TransactionClient
  ) {
    console.log("❌ [ORDER-REPO] Marking order as cancelled:", orderId)

    return this.update(
      orderId,
      {
        status: OrderStatus.CANCELLED,
        failureCode: null,
        failureReason: null,
      },
      tx
    )
  }

  /**
   * Mark order as cancelled with a stable reason payload
   */
  async markCancelledWithReason(
    orderId: string,
    failureCode: string,
    failureReason: string,
    tx?: Prisma.TransactionClient
  ) {
    console.log("❌ [ORDER-REPO] Marking order as cancelled with reason:", {
      orderId,
      failureCode,
      failureReason,
    })

    return this.update(
      orderId,
      {
        status: OrderStatus.CANCELLED,
        failureCode,
        failureReason,
      },
      tx
    )
  }

  /**
   * Find order by ID
   */
  async findById(
    orderId: string,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔍 [ORDER-REPO] Finding order by ID:", orderId)

    const client = tx || prisma

    const order = await client.order.findUnique({
      where: { id: orderId },
      include: {
        tradingAccount: {
          select: {
            id: true,
            userId: true,
            balance: true,
            availableMargin: true
          }
        },
        Stock: {
          select: {
            instrumentId: true,
            symbol: true,
            segment: true,
            lot_size: true,
            ltp: true
          }
        }
      }
    })

    if (order) {
      console.log("✅ [ORDER-REPO] Order found")
    } else {
      console.log("⚠️ [ORDER-REPO] Order not found")
    }

    return order
  }

  /**
   * Find orders by trading account
   */
  async findByAccountId(
    tradingAccountId: string,
    limit: number = 100,
    offset: number = 0,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔍 [ORDER-REPO] Finding orders for account:", {
      tradingAccountId,
      limit,
      offset
    })

    const client = tx || prisma

    const orders = await client.order.findMany({
      where: { tradingAccountId },
      include: {
        Stock: {
          select: {
            instrumentId: true,
            symbol: true,
            segment: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    })

    console.log(`✅ [ORDER-REPO] Found ${orders.length} orders`)
    return orders
  }

  /**
   * Find pending orders
   */
  async findPending(
    tradingAccountId: string,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔍 [ORDER-REPO] Finding pending orders:", tradingAccountId)

    const client = tx || prisma

    const orders = await client.order.findMany({
      where: {
        tradingAccountId,
        status: OrderStatus.PENDING
      },
      include: {
        Stock: {
          select: {
            instrumentId: true,
            symbol: true,
            segment: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log(`✅ [ORDER-REPO] Found ${orders.length} pending orders`)
    return orders
  }

  /**
   * Find orders by status
   */
  async findByStatus(
    tradingAccountId: string,
    status: OrderStatus,
    limit: number = 100,
    tx?: Prisma.TransactionClient
  ) {
    console.log("🔍 [ORDER-REPO] Finding orders by status:", {
      tradingAccountId,
      status,
      limit
    })

    const client = tx || prisma

    const orders = await client.order.findMany({
      where: {
        tradingAccountId,
        status
      },
      include: {
        Stock: {
          select: {
            instrumentId: true,
            symbol: true,
            segment: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    console.log(`✅ [ORDER-REPO] Found ${orders.length} ${status} orders`)
    return orders
  }

  /**
   * Get order statistics
   */
  async getStatistics(
    tradingAccountId: string,
    tx?: Prisma.TransactionClient
  ) {
    console.log("📊 [ORDER-REPO] Getting order statistics:", tradingAccountId)

    const client = tx || prisma

    const [total, executed, pending, cancelled] = await Promise.all([
      client.order.count({ where: { tradingAccountId } }),
      client.order.count({ where: { tradingAccountId, status: OrderStatus.EXECUTED } }),
      client.order.count({ where: { tradingAccountId, status: OrderStatus.PENDING } }),
      client.order.count({ where: { tradingAccountId, status: OrderStatus.CANCELLED } })
    ])

    const stats = {
      total,
      executed,
      pending,
      cancelled,
      executionRate: total > 0 ? (executed / total) * 100 : 0
    }

    console.log("✅ [ORDER-REPO] Statistics calculated:", stats)
    return stats
  }
}

/**
 * Create repository instance
 */
export function createOrderRepository(): OrderRepository {
  console.log("🏭 [ORDER-REPO] Creating repository instance")
  return new OrderRepository()
}

console.log("✅ [ORDER-REPO] Module initialized")