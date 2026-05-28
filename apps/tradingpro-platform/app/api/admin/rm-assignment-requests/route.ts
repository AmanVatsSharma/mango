/**
 * @file route.ts
 * @module admin-console
 * @description List RM assignment requests (client queue) — requires admin.users.rm.
 * @author StockTrade
 * @created 2026-03-28
 */

import { NextResponse } from "next/server"
import { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

const VALID_STATUS = new Set(["PENDING", "FULFILLED", "DISMISSED", "ALL"])

/**
 * GET /api/admin/rm-assignment-requests
 * Query: status (PENDING default | FULFILLED | DISMISSED | ALL), limit, offset
 */
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/rm-assignment-requests",
      required: "admin.users.rm",
      fallbackMessage: "Failed to fetch RM assignment requests",
    },
    async (ctx) => {
      const url = new URL(req.url)
      const statusParam = (url.searchParams.get("status") || "PENDING").toUpperCase()
      const status = VALID_STATUS.has(statusParam) ? statusParam : "PENDING"
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200)
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0)

      const where =
        status === "ALL"
          ? {}
          : {
              status,
            }

      const [requests, totalMatching, pendingCount, clientsWithoutRm] = await Promise.all([
        prisma.rmAssignmentRequest.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                clientId: true,
                managedById: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.rmAssignmentRequest.count({ where }),
        prisma.rmAssignmentRequest.count({ where: { status: "PENDING" } }),
        prisma.user.count({
          where: {
            role: Role.USER,
            managedById: null,
          },
        }),
      ])

      ctx.logger.info(
        { count: requests.length, totalMatching, pendingCount, status },
        "GET /api/admin/rm-assignment-requests - success",
      )

      return NextResponse.json({
        requests: requests.map((r) => ({
          id: r.id,
          userId: r.userId,
          status: r.status,
          note: r.note,
          dismissReason: r.dismissReason,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          resolvedById: r.resolvedById,
          user: r.user,
        })),
        meta: {
          totalMatching,
          pendingCount,
          clientsWithoutRm,
          limit,
          offset,
        },
      })
    },
  )
}
