import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/cleanup/preview",
      required: "admin.cleanup.read",
      fallbackMessage: "Failed to preview cleanup",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const beforeParam = searchParams.get("before")
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const before = beforeParam ? new Date(beforeParam) : today
      if (Number.isNaN(before.getTime())) {
        return NextResponse.json({ error: "Invalid before date" }, { status: 400 })
      }

      ctx.logger.debug({ before: before.toISOString() }, "GET /api/admin/cleanup/preview - request")

      const [oldOrders, oldClosedPositions, sampleOrders, samplePositions, earliestOrder, latestPre] = await Promise.all([
        adminPrisma.order.count({ where: { createdAt: { lt: before } } }),
        adminPrisma.position.count({
          where: {
            quantity: 0,
            createdAt: { lt: before },
          },
        }),
        adminPrisma.order.findMany({
          where: { createdAt: { lt: before } },
          take: 5,
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, symbol: true, status: true },
        }),
        adminPrisma.position.findMany({
          where: {
            quantity: 0,
            createdAt: { lt: before },
          },
          take: 5,
          orderBy: { createdAt: "asc" },
          select: { id: true, createdAt: true, symbol: true },
        }),
        adminPrisma.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        adminPrisma.order.findFirst({
          where: { createdAt: { lt: before } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ])

      const samples = [
        ...sampleOrders.map((o) => ({
          type: "ORDER" as const,
          id: o.id,
          date: o.createdAt.toISOString(),
          meta: `${o.symbol} • ${o.status}`,
        })),
        ...samplePositions.map((p) => ({
          type: "POSITION" as const,
          id: p.id,
          date: p.createdAt.toISOString(),
          meta: p.symbol,
        })),
      ]

      ctx.logger.info({ oldOrders, oldClosedPositions }, "GET /api/admin/cleanup/preview - success")
      return NextResponse.json(
        {
          counts: {
            oldOrders,
            oldClosedPositions,
            earliest: earliestOrder?.createdAt?.toISOString() || null,
            latest: latestPre?.createdAt?.toISOString() || null,
          },
          samples,
        },
        { status: 200 }
      )
    }
  )
}
