/**
 * @file route.ts
 * @module admin-console
 * @description Admin KYC queue API for review, assignment, SLA, and AML metadata
 * @author StockTrade
 * @created 2026-01-15
 * @updated 2026-04-07
 *
 * Notes:
 * - `relatedContactOverlap=1` restricts to applicants whose user id appears in `fetchAdminUserIdsWithContactOverlap` (MOD RM-scoped).
 * - `lifecycle=LEAD|APPROVED_NOT_TRADING|TRADING` segments the queue (Leads = not approved; approved-no-trades = no EXECUTED orders; trading = ≥1 executed order).
 * - kycApplications[].user includes isTradingDashboardOnline from trading SSE presence.
 * - kycApplications[].user includes relatedEmailCount / relatedPhoneCount for duplicate-contact cues.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { hasPermission } from "@/lib/rbac/admin-guard"
import { normalizeAmlFlags } from "@/lib/admin/kyc-utils"
import { withKycApplicationsTradingPresence } from "@/lib/server/admin-trading-presence"
import {
  batchAdminRelatedContactCounts,
  fetchAdminUserIdsWithContactOverlap,
} from "@/lib/server/admin-related-users"
import { AppError } from "@/src/common/errors"
import { KycAmlStatus, KycReviewAction, KycSuspiciousStatus, KycStatus, OrderStatus } from "@prisma/client"
import { resolveKycDocumentUrl } from "@/lib/kyc-document"
import {
  normalizeAdminKycLimitParam,
  normalizeAdminKycLifecycleParam,
  normalizeAdminKycOptionalDateField,
  normalizeAdminKycPageParam,
  normalizeAdminKycRelatedContactOverlapParam,
} from "@/lib/server/admin-kyc-query-utils"
import { createClientCrmService } from "@/lib/services/admin/client-crm.service"

export const dynamic = "force-dynamic"

/**
 * Narrow the queue by broker lifecycle: leads (KYC not approved), approved clients with no fills yet, or active traders (≥1 executed order).
 * Wraps the existing Prisma `where` in `AND` so SLA/search/overlap filters keep working.
 */
function appendKycLifecycleAndClause(
  where: Record<string, unknown>,
  lifecycle: ReturnType<typeof normalizeAdminKycLifecycleParam>,
  statusParam: string | null,
) {
  if (lifecycle === "ALL") {
    return
  }
  const extra: Record<string, unknown>[] = []
  if (lifecycle === "LEAD") {
    if (
      statusParam &&
      statusParam !== "ALL" &&
      statusParam !== "PENDING" &&
      statusParam !== "REJECTED"
    ) {
      extra.push({ id: { in: [] } })
    } else {
      extra.push({ status: { in: [KycStatus.PENDING, KycStatus.REJECTED] } })
    }
  } else if (lifecycle === "APPROVED_NOT_TRADING") {
    if (statusParam && statusParam !== "ALL" && statusParam !== "APPROVED") {
      extra.push({ id: { in: [] } })
    } else {
      extra.push({ status: KycStatus.APPROVED })
      extra.push({
        user: {
          OR: [
            { tradingAccount: null },
            { tradingAccount: { orders: { none: { status: OrderStatus.EXECUTED } } } },
          ],
        },
      })
    }
  } else if (lifecycle === "TRADING") {
    if (statusParam && statusParam !== "ALL" && statusParam !== "APPROVED") {
      extra.push({ id: { in: [] } })
    } else {
      extra.push({ status: KycStatus.APPROVED })
      extra.push({
        user: {
          tradingAccount: {
            orders: { some: { status: OrderStatus.EXECUTED } },
          },
        },
      })
    }
  }
  if (extra.length === 0) {
    return
  }
  const base = { ...where }
  for (const key of Object.keys(where)) {
    delete (where as Record<string, unknown>)[key]
  }
  where.AND = [base, ...extra]
}

const parseFlagFilter = (value: string | null) => {
  if (!value) return []
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return normalizeAmlFlags(parts)
}

export async function GET(request: NextRequest) {
  return handleAdminApi(
    request,
    {
      route: "/api/admin/kyc",
      required: "admin.users.kyc",
      fallbackMessage: "Failed to fetch KYC applications",
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url)
      const status = searchParams.get("status")
      const page = normalizeAdminKycPageParam(searchParams.get("page"))
      const limit = normalizeAdminKycLimitParam(searchParams.get("limit"))
      const search = searchParams.get("search")
      const assignedTo = searchParams.get("assignedTo")
      const amlStatus = searchParams.get("amlStatus")
      const suspiciousStatus = searchParams.get("suspiciousStatus")
      const slaFilter = searchParams.get("sla")
      const flag = searchParams.get("flag")
      const relatedContactOverlap = normalizeAdminKycRelatedContactOverlapParam(
        searchParams.get("relatedContactOverlap"),
      )
      const lifecycle = normalizeAdminKycLifecycleParam(searchParams.get("lifecycle"))
      const bookScopedRmIdForOverlap = ctx.role === "MODERATOR" ? ctx.session.user.id : null

      ctx.logger.debug(
        {
          status,
          page,
          limit,
          search,
          assignedTo,
          amlStatus,
          suspiciousStatus,
          slaFilter,
          flag,
          relatedContactOverlap,
          lifecycle,
        },
        "GET /api/admin/kyc - params",
      )

      const where: any = {}
      if (status && status !== "ALL") {
        where.status = status
      }
      if (assignedTo) {
        if (assignedTo === "UNASSIGNED") {
          where.assignedToId = null
        } else {
          where.assignedToId = assignedTo
        }
      }
      if (amlStatus && amlStatus !== "ALL") {
        where.amlStatus = amlStatus
      }
      if (suspiciousStatus && suspiciousStatus !== "ALL") {
        where.suspiciousStatus = suspiciousStatus
      }
      const flagFilter = parseFlagFilter(flag)
      if (flagFilter.length === 1) {
        where.amlFlags = { has: flagFilter[0] }
      } else if (flagFilter.length > 1) {
        where.amlFlags = { hasSome: flagFilter }
      }
      if (slaFilter && slaFilter !== "ALL") {
        const now = new Date()
        const enforcePending = () => {
          if (!status || status === "ALL") {
            where.status = KycStatus.PENDING
          }
        }
        const dueWithinHours = (hours: number) => {
          const dueSoon = new Date(now.getTime() + hours * 60 * 60 * 1000)
          where.slaDueAt = { gte: now, lte: dueSoon }
          enforcePending()
        }
        if (slaFilter === "OVERDUE") {
          where.slaDueAt = { lt: now }
          enforcePending()
        }
        if (slaFilter === "DUE_SOON") {
          dueWithinHours(24)
        }
        if (slaFilter === "DUE_48H") {
          dueWithinHours(48)
        }
        if (slaFilter === "DUE_72H") {
          dueWithinHours(72)
        }
      }
      if (search) {
        where.user = {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { clientId: { contains: search, mode: "insensitive" } },
          ],
        }
      }

      if (relatedContactOverlap) {
        const overlapUserIds = await fetchAdminUserIdsWithContactOverlap(prisma, bookScopedRmIdForOverlap)
        ctx.logger.debug(
          { hasOverlapFilter: true, overlapCount: overlapUserIds.length },
          "GET /api/admin/kyc - relatedContactOverlap",
        )
        if (overlapUserIds.length === 0) {
          where.userId = { in: [] }
        } else {
          where.userId = { in: overlapUserIds }
        }
      }

      appendKycLifecycleAndClause(where, lifecycle, status)

      const [kycApplications, totalCount, statusCounts, overdueCount, flaggedCount, suspiciousCount, assignedCount] =
        await Promise.all([
          prisma.kYC.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  clientId: true,
                  createdAt: true,
                  role: true,
                  tradingAccount: {
                    select: {
                      orders: {
                        where: { status: OrderStatus.EXECUTED },
                        take: 1,
                        select: { id: true },
                      },
                    },
                  },
                },
              },
              assignedTo: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
              _count: {
                select: { reviewLogs: true },
              },
            },
            orderBy: { submittedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
          }),
          prisma.kYC.count({ where }),
          prisma.kYC.groupBy({
            by: ["status"],
            _count: { status: true },
            where,
          }),
          prisma.kYC.count({
            where: { ...where, slaDueAt: { lt: new Date() }, status: KycStatus.PENDING },
          }),
          prisma.kYC.count({
            where: { ...where, NOT: { amlFlags: { equals: [] } } },
          }),
          prisma.kYC.count({
            where: { ...where, suspiciousStatus: { not: KycSuspiciousStatus.NONE } },
          }),
          prisma.kYC.count({
            where: { ...where, assignedToId: { not: null } },
          }),
        ])

      const hydratedKycApplications = await Promise.all(
        kycApplications.map(async (application) => {
          const bankProofKey = (application as { bankProofKey?: string | null }).bankProofKey ?? null
          const resolvedDocumentUrl = await resolveKycDocumentUrl({
            bankProofKey,
            bankProofUrl: application.bankProofUrl,
          })

          return {
            ...application,
            bankProofUrl: resolvedDocumentUrl || application.bankProofUrl,
          }
        })
      )

      const kycApplicationsWithPresence = await withKycApplicationsTradingPresence(hydratedKycApplications)

      const applicantIds = kycApplicationsWithPresence.map((a) => a.user.id)
      const relatedCountMap = await batchAdminRelatedContactCounts(
        prisma,
        applicantIds,
        bookScopedRmIdForOverlap,
      )

      let kycApplicationsWithRelated = kycApplicationsWithPresence.map((app) => {
        const c = relatedCountMap.get(app.user.id) ?? { relatedEmailCount: 0, relatedPhoneCount: 0 }
        const overlap = c.relatedEmailCount + c.relatedPhoneCount > 0
        const userWithTa = app.user as typeof app.user & {
          tradingAccount?: { orders: { id: string }[] } | null
        }
        const hasEx = Boolean(userWithTa.tradingAccount?.orders?.length)
        const { tradingAccount: _tradingAccount, ...userRest } = userWithTa
        void _tradingAccount
        let lifecycleSegment: "LEAD" | "APPROVED_NOT_TRADING" | "TRADING"
        if (app.status !== KycStatus.APPROVED) {
          lifecycleSegment = "LEAD"
        } else if (hasEx) {
          lifecycleSegment = "TRADING"
        } else {
          lifecycleSegment = "APPROVED_NOT_TRADING"
        }
        return {
          ...app,
          user: {
            ...userRest,
            hasExecutedTrade: hasEx,
            lifecycleSegment,
            relatedEmailCount: c.relatedEmailCount,
            relatedPhoneCount: c.relatedPhoneCount,
            hasRelatedContactOverlap: overlap,
          },
        }
      })

      let crmCallbackRadar: {
        overdue: number
        dueInHour: number
        dueToday: number
        observedAt: string
      } | null = null

      if (hasPermission(ctx.permissions, "admin.users.crm")) {
        const crmSvc = createClientCrmService()
        const [hints, radar] = await Promise.all([
          crmSvc.getTaskHintsForUserIds(applicantIds),
          crmSvc.getCallbackRadar(ctx.role, ctx.session.user.id),
        ])
        crmCallbackRadar = radar
        const emptyHint = { nextDueAt: null as string | null, overdueCount: 0, openCount: 0 }
        kycApplicationsWithRelated = kycApplicationsWithRelated.map((app) => ({
          ...app,
          user: {
            ...app.user,
            crmTaskHint: hints[app.user.id] ?? emptyHint,
          },
        }))
      }

      ctx.logger.info(
        { count: kycApplicationsWithRelated.length, total: totalCount, page, limit },
        "GET /api/admin/kyc - success",
      )

      return NextResponse.json({
        kycApplications: kycApplicationsWithRelated,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item.status] = item._count.status
          return acc
        }, {} as Record<string, number>),
        meta: {
          overdueCount,
          flaggedCount,
          suspiciousCount,
          assignedCount,
          ...(crmCallbackRadar ? { crmCallbackRadar } : {}),
        },
      })
    }
  )
}

export async function PATCH(request: NextRequest) {
  return handleAdminApi(
    request,
    {
      route: "/api/admin/kyc",
      required: "admin.users.kyc",
      fallbackMessage: "Failed to update KYC application",
    },
    async (ctx) => {
      const body = await request.json()
      const { kycId, assignedToId, slaDueAt, amlStatus, amlFlags, suspiciousStatus, note, action } = body

      ctx.logger.debug({ kycId, assignedToId, amlStatus, suspiciousStatus }, "PATCH /api/admin/kyc - request")

      if (!kycId) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "KYC ID is required",
          statusCode: 400,
        })
      }

      const existing = await prisma.kYC.findUnique({
        where: { id: kycId },
      })

      if (!existing) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "KYC record not found",
          statusCode: 404,
        })
      }

      const updateData: any = {}

      if (assignedToId !== undefined) {
        if (assignedToId) {
          const assignee = await prisma.user.findUnique({
            where: { id: assignedToId },
            select: { id: true, role: true },
          })
          if (!assignee) {
            throw new AppError({
              code: "NOT_FOUND",
              message: "Assigned reviewer not found",
              statusCode: 404,
            })
          }
          if (!["ADMIN", "MODERATOR", "SUPER_ADMIN"].includes(assignee.role)) {
            throw new AppError({
              code: "VALIDATION_ERROR",
              message: "Reviewer must be an admin or moderator",
              statusCode: 400,
            })
          }
        }
        updateData.assignedToId = assignedToId || null
        updateData.assignedAt = assignedToId ? new Date() : null
      }

    const parsedSlaResult = normalizeAdminKycOptionalDateField(slaDueAt)
    if (!parsedSlaResult.valid) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid SLA due date",
        statusCode: 400,
      })
    }
    if (parsedSlaResult.provided) {
      updateData.slaDueAt = parsedSlaResult.value
      updateData.slaBreachedAt =
        parsedSlaResult.value && existing.status === KycStatus.PENDING && parsedSlaResult.value.getTime() < Date.now()
          ? new Date()
          : null
    }

      if (amlStatus) {
        if (!Object.values(KycAmlStatus).includes(amlStatus)) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Invalid AML status",
            statusCode: 400,
          })
        }
        updateData.amlStatus = amlStatus as KycAmlStatus
      }

    if (amlFlags) {
      const normalizedFlags = Array.isArray(amlFlags) ? amlFlags : [amlFlags]
      updateData.amlFlags = normalizeAmlFlags(normalizedFlags as string[])
    }

      if (suspiciousStatus) {
        if (!Object.values(KycSuspiciousStatus).includes(suspiciousStatus)) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Invalid suspicious status",
            statusCode: 400,
          })
        }
        updateData.suspiciousStatus = suspiciousStatus as KycSuspiciousStatus
      }

      if (Object.keys(updateData).length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "No update fields provided",
          statusCode: 400,
        })
      }

      const updatedKyc = await prisma.kYC.update({
        where: { id: kycId },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              clientId: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      })

    const reviewAction = (() => {
      if (action && Object.values(KycReviewAction).includes(action)) {
        return action as KycReviewAction
      }
      if (assignedToId !== undefined) {
        return assignedToId ? KycReviewAction.ASSIGNED : KycReviewAction.UNASSIGNED
      }
      if (amlStatus || amlFlags) return KycReviewAction.AML_UPDATED
      if (suspiciousStatus) return KycReviewAction.SUSPICIOUS_UPDATED
      return KycReviewAction.NOTE_ADDED
    })()

      await prisma.kycReviewLog.create({
        data: {
          kycId,
          reviewerId: ctx.session.user.id,
          action: reviewAction,
          note: note || null,
          metadata: {
            assignedToId: assignedToId ?? undefined,
            slaDueAt: parsedSlaResult.value?.toISOString(),
            amlStatus,
            amlFlags: updateData.amlFlags,
            suspiciousStatus,
          },
        },
      })

      ctx.logger.info({ kycId, reviewAction }, "PATCH /api/admin/kyc - success")

      return NextResponse.json({
        success: true,
        kyc: updatedKyc,
      })
    }
  )
}

export async function PUT(request: NextRequest) {
  return handleAdminApi(
    request,
    {
      route: "/api/admin/kyc",
      required: "admin.users.kyc",
      fallbackMessage: "Failed to update KYC status",
    },
    async (ctx) => {
      const body = await request.json()
      const { kycId, status, reason } = body

      ctx.logger.debug({ kycId, status }, "PUT /api/admin/kyc - request")

      if (!kycId || !status) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "KYC ID and status are required",
          statusCode: 400,
        })
      }

      if (![KycStatus.APPROVED, KycStatus.REJECTED].includes(status)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid status. Must be APPROVED or REJECTED",
          statusCode: 400,
        })
      }

      const updatedKYC = await prisma.kYC.update({
        where: { id: kycId },
        data: {
          status,
          approvedAt: status === KycStatus.APPROVED ? new Date() : null,
          slaBreachedAt: null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              clientId: true,
            },
          },
        },
      })

      await prisma.kycReviewLog.create({
        data: {
          kycId,
          reviewerId: ctx.session.user.id,
          action: KycReviewAction.STATUS_UPDATED,
          note: reason || null,
          metadata: {
            status,
          },
        },
      })

      await prisma.tradingLog.create({
        data: {
          clientId: updatedKYC.user.clientId || "UNKNOWN",
          userId: ctx.session.user.id,
          action: `KYC_${status.toLowerCase()}`,
          message: `KYC ${status.toLowerCase()} for ${updatedKYC.user.name} (${updatedKYC.user.email})`,
          details: {
            kycId,
            reason: reason || "",
            approvedAt: status === KycStatus.APPROVED ? new Date() : null,
          },
          category: "SYSTEM",
          level: "INFO",
        },
      })

      try {
        const { NotificationService } = await import("@/lib/services/notifications/NotificationService")
        await NotificationService.notifyKYC(
          updatedKYC.userId,
          status as "APPROVED" | "REJECTED",
          reason || undefined
        )
      } catch (notifError) {
        ctx.logger.warn({ err: notifError }, "PUT /api/admin/kyc - notification failed")
      }

      ctx.logger.info({ kycId, status }, "PUT /api/admin/kyc - success")

      return NextResponse.json({
        success: `KYC ${status.toLowerCase()} successfully`,
        kyc: updatedKYC,
      })
    }
  )
}
