/**
 * @file route.ts
 * @module admin-console
 * @description API endpoint to fetch related orders and transactions for a position
 * @author StockTrade
 * @created 2025-01-27
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { adminPrisma } from '@/lib/server/prisma-admin'
import { handleAdminApi } from '@/lib/rbac/admin-api'
import { AppError } from '@/src/common/errors'

export async function GET(
  req: Request,
  { params }: { params: { positionId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/positions/${params.positionId}/related`,
      required: 'admin.positions.read',
      fallbackMessage: 'Failed to fetch related position data',
    },
    async (ctx) => {
      const { positionId } = params
      ctx.logger.debug({ positionId }, 'GET /api/admin/positions/[positionId]/related - request')

    // Fetch position with trading account
    const position = await adminPrisma.position.findUnique({
      where: { id: positionId },
      include: {
        tradingAccount: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                clientId: true
              }
            }
          }
        }
      }
    })

    if (!position) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Position not found', statusCode: 404 })
    }

    // Fetch related orders
    const orders = await adminPrisma.order.findMany({
      where: {
        positionId: positionId
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        tradingAccount: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                clientId: true
              }
            }
          }
        }
      }
    })

    // Fetch related transactions:
    // 1. Transactions directly linked to position (positionId)
    // 2. Transactions linked via orders that belong to this position
    const relatedOrderIds = orders.map(o => o.id)

    const transactions = await adminPrisma.transaction.findMany({
      where: {
        OR: [
          { positionId: positionId }, // Directly linked to position
          ...(relatedOrderIds.length > 0 ? [{ orderId: { in: relatedOrderIds } }] : []) // Linked via orders
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        tradingAccount: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                clientId: true
              }
            }
          }
        },
        order: {
          select: {
            id: true,
            symbol: true,
            orderSide: true,
            orderType: true
          }
        }
      }
    })

      ctx.logger.info(
        { orders: orders.length, transactions: transactions.length },
        'GET /api/admin/positions/[positionId]/related - success'
      )

    return NextResponse.json({
      position,
      orders,
      transactions
    }, { status: 200 })
    }
  )
}
