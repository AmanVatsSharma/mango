/**
 * @file route.ts
 * @module admin-console
 * @description Admin logs API - get trading logs for admin console
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleAdminApi } from '@/lib/rbac/admin-api'
import { normalizeAdminListLimitParam } from '@/lib/server/admin-list-query-number-utils'

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: '/api/admin/logs',
      required: 'admin.logs.read',
      fallbackMessage: 'Failed to fetch logs',
    },
    async ({ logger }) => {
      const { searchParams } = new URL(req.url)
      const category = searchParams.get('category') as any
      const level = searchParams.get('level') as any
      const limit = normalizeAdminListLimitParam(searchParams.get('limit'), 100, 500)

      const where: any = {}
      if (category) where.category = category
      if (level) where.level = level

      logger.debug({ category, level, limit }, 'GET /api/admin/logs - start')

      const logs = await prisma.tradingLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      logger.info({ count: logs.length }, 'GET /api/admin/logs - success')
      return NextResponse.json({ logs, total: logs.length }, { status: 200 })
    }
  )
}