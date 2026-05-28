/**
 * @file app/api/super-admin/withdrawals/audit/route.ts
 * @module admin-console
 * @description Super-admin withdrawal approval and rejection audit trail (FUNDS trading_logs).
 * @author StockTrade
 * @created 2026-03-20
 * @notes RBAC: admin.super.financial.read; same query contract as deposits audit.
 */

import { NextResponse } from "next/server"
import { WithdrawalAuditService } from "@/lib/services/admin/WithdrawalAuditService"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { normalizeApiBoundedInteger, normalizeApiOptionalDate } from "@/lib/server/api-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/withdrawals/audit",
      required: "admin.super.financial.read",
      fallbackMessage: "Failed to fetch withdrawal audit",
    },
    async (ctx) => {
      const { searchParams } = new URL(ctx.req.url)
      const statusParam = searchParams.get("status") || undefined
      const normalizedStatus = statusParam ? statusParam.toUpperCase() : undefined
      const adminId = searchParams.get("adminId") || undefined
      const adminName = searchParams.get("adminName") || undefined
      const search = searchParams.get("search") || undefined
      const fromParam = searchParams.get("from")
      const toParam = searchParams.get("to")
      const pageParam = normalizeApiBoundedInteger(searchParams.get("page"), 1, 1, 10_000)
      const pageSizeParam = normalizeApiBoundedInteger(searchParams.get("pageSize"), 20, 1, 500)

      const from = normalizeApiOptionalDate(fromParam)
      const to = normalizeApiOptionalDate(toParam)
      if (fromParam !== null && fromParam.trim() !== "" && !from) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid from date", statusCode: 400 })
      }
      if (toParam !== null && toParam.trim() !== "" && !to) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid to date", statusCode: 400 })
      }

      const data = await WithdrawalAuditService.list({
        status: normalizedStatus as any,
        adminId,
        adminName,
        search,
        from,
        to,
        page: pageParam,
        pageSize: pageSizeParam,
      })

      ctx.logger.info(
        { count: data.records.length, total: data.total, status: normalizedStatus },
        "GET /api/super-admin/withdrawals/audit - success",
      )

      return NextResponse.json({ success: true, data })
    },
  )
}
