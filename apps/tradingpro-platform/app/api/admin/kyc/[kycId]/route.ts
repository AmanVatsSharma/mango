/**
 * @file route.ts
 * @module admin-console
 * @description Admin KYC detail and review log API
 * @author StockTrade
 * @created 2026-01-15
 * @updated 2026-04-03
 *
 * Notes:
 * - kyc.user includes isTradingDashboardOnline when present in list API pattern.
 * - relatedUsers shares normalized email/phone matches; MODERATOR sees book-scoped related rows only.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { withKycApplicationsTradingPresence } from "@/lib/server/admin-trading-presence"
import { queryAdminRelatedUsers } from "@/lib/server/admin-related-users"
import { AppError } from "@/src/common/errors"
import { resolveKycDocumentUrl } from "@/lib/kyc-document"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: { kycId: string } }) {
  return handleAdminApi(
    request,
    {
      route: "/api/admin/kyc/[kycId]",
      required: "admin.users.kyc",
      fallbackMessage: "Failed to fetch KYC details",
    },
    async (ctx) => {
      ctx.logger.debug({ kycId: params.kycId }, "GET /api/admin/kyc/[kycId] - request")

      const kyc = await prisma.kYC.findUnique({
        where: { id: params.kycId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              clientId: true,
              role: true,
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
          reviewLogs: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      })

      if (!kyc) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "KYC record not found",
          statusCode: 404,
        })
      }

      const bankProofKey = (kyc as { bankProofKey?: string | null }).bankProofKey ?? null
      const resolvedDocumentUrl = await resolveKycDocumentUrl({
        bankProofKey,
        bankProofUrl: kyc.bankProofUrl,
      })
      const hydratedKyc = {
        ...kyc,
        bankProofUrl: resolvedDocumentUrl || kyc.bankProofUrl,
      }

      const [kycWithPresence] = await withKycApplicationsTradingPresence([hydratedKyc])

      const bookScopedRmId = ctx.role === "MODERATOR" ? ctx.session.user.id : null
      const relatedRaw = await queryAdminRelatedUsers(prisma, kyc.user.id, bookScopedRmId)
      const relatedUsers = relatedRaw.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        clientId: r.clientId,
        createdAt: r.createdAt.toISOString(),
        kycStatus: r.kycStatus ?? "NOT_SUBMITTED",
      }))

      ctx.logger.info(
        {
          kycId: params.kycId,
          reviewLogsCount: kyc.reviewLogs.length,
          relatedUsersCount: relatedUsers.length,
        },
        "GET /api/admin/kyc/[kycId] - success"
      )

      return NextResponse.json({ kyc: kycWithPresence, relatedUsers })
    }
  )
}
