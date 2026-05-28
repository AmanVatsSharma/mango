/**
 * @file route.ts
 * @module admin-api/session-security
 * @description List and update security incidents (filters + optional bulk status).
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 */

import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  SecurityIncidentStatus,
  SecurityIncidentType,
  AuthEventSeverity,
} from "@prisma/client"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/incidents",
      required: "admin.session-security.read",
      fallbackMessage: "Failed to list incidents",
    },
    async () => {
      const { searchParams } = new URL(req.url)
      const status = searchParams.get("status")?.trim()
      const type = searchParams.get("type")?.trim()
      const severity = searchParams.get("severity")?.trim()
      const q = searchParams.get("q")?.trim()
      const from = searchParams.get("from")
      const to = searchParams.get("to")
      const page = Math.max(0, Number(searchParams.get("page") || "0") || 0)
      const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || "50") || 50))

      const where: Prisma.SecurityIncidentWhereInput = {}
      if (status && status in SecurityIncidentStatus) {
        where.status = status as SecurityIncidentStatus
      }
      if (type && type in SecurityIncidentType) {
        where.type = type as SecurityIncidentType
      }
      if (severity && severity in AuthEventSeverity) {
        where.severity = severity as AuthEventSeverity
      }
      if (q) {
        where.message = { contains: q, mode: "insensitive" }
      }
      if (from || to) {
        where.createdAt = {}
        if (from) where.createdAt.gte = new Date(from)
        if (to) where.createdAt.lte = new Date(to)
      }

      const [total, incidents] = await Promise.all([
        prisma.securityIncident.count({ where }),
        prisma.securityIncident.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: page * limit,
          take: limit,
        }),
      ])

      const MAX_RELATED_USER_IDS = 500
      const relatedIdSet = new Set<string>()
      for (const inc of incidents) {
        for (const uid of inc.relatedUserIds) {
          if (relatedIdSet.size >= MAX_RELATED_USER_IDS) break
          relatedIdSet.add(uid)
        }
        if (relatedIdSet.size >= MAX_RELATED_USER_IDS) break
      }
      const relatedIds = Array.from(relatedIdSet)
      const users =
        relatedIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: relatedIds } },
              select: { id: true, email: true, clientId: true, name: true },
            })
          : []

      const userSummaries: Record<
        string,
        { id: string; email: string | null; clientId: string | null; name: string | null }
      > = {}
      for (const u of users) {
        userSummaries[u.id] = {
          id: u.id,
          email: u.email,
          clientId: u.clientId,
          name: u.name,
        }
      }

      return NextResponse.json({
        success: true,
        data: { incidents, userSummaries, total, page, limit },
      })
    },
  )
}

function resolvedData(
  status: SecurityIncidentStatus,
  adminId: string | undefined,
): {
  status: SecurityIncidentStatus
  resolvedAt?: Date
  resolvedById?: string
} {
  const closes =
    status === SecurityIncidentStatus.CLOSED ||
    status === SecurityIncidentStatus.ACKNOWLEDGED ||
    status === SecurityIncidentStatus.FALSE_POSITIVE
  return {
    status,
    resolvedAt: closes ? new Date() : undefined,
    resolvedById: closes ? adminId : undefined,
  }
}

export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/incidents",
      required: "admin.session-security.manage",
      fallbackMessage: "Failed to update incident",
    },
    async ({ session }) => {
      const adminId = session?.user?.id as string | undefined
      const body = (await req.json().catch(() => null)) as {
        id?: string
        ids?: string[]
        status?: SecurityIncidentStatus
      } | null

      if (!body?.status) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "status required",
          statusCode: 400,
        })
      }

      if (body.ids && body.ids.length > 0) {
        const data = resolvedData(body.status, adminId)
        await prisma.securityIncident.updateMany({
          where: { id: { in: body.ids } },
          data: {
            status: data.status,
            resolvedAt: data.resolvedAt,
            resolvedById: data.resolvedById,
          },
        })
        return NextResponse.json({ success: true, data: { updated: body.ids.length } })
      }

      if (!body.id) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "id or ids required",
          statusCode: 400,
        })
      }

      const data = resolvedData(body.status, adminId)
      const updated = await prisma.securityIncident.update({
        where: { id: body.id },
        data: {
          status: data.status,
          resolvedAt: data.resolvedAt,
          resolvedById: data.resolvedById,
        },
      })

      return NextResponse.json({ success: true, data: { incident: updated } })
    },
  )
}
