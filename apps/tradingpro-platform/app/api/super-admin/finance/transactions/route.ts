/**
 * @file route.ts
 * @module admin-console
 * @description API route for super-admin financial transactions listing
 * @author StockTrade
 * @created 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SuperAdminFinanceService } from "@/lib/services/admin/SuperAdminFinanceService"
import { AppError } from "@/src/common/errors"
import { normalizeApiBoundedInteger, normalizeApiOptionalDate } from "@/lib/server/api-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/super-admin/finance/transactions",
      required: "admin.super.financial.read",
      fallbackMessage: "Failed to fetch transactions",
    },
    async (ctx) => {
      const { searchParams } = new URL(ctx.req.url)
      const type = (searchParams.get("type") || "DEPOSIT") as "DEPOSIT" | "WITHDRAWAL"
      const status = searchParams.get("status") || undefined
      const method = searchParams.get("method") || undefined
      const userId = searchParams.get("userId") || undefined
      const bankAccountId = searchParams.get("bankAccountId") || undefined
      const fromRaw = searchParams.get("from")
      const toRaw = searchParams.get("to")
      const from = normalizeApiOptionalDate(fromRaw)
      const to = normalizeApiOptionalDate(toRaw)
      const page = normalizeApiBoundedInteger(searchParams.get("page"), 1, 1, 10_000)
      const pageSize = normalizeApiBoundedInteger(searchParams.get("pageSize"), 20, 1, 500)

      if (fromRaw !== null && fromRaw.trim() !== "" && !from) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid from date", statusCode: 400 })
      }
      if (toRaw !== null && toRaw.trim() !== "" && !to) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid to date", statusCode: 400 })
      }

      const data = await SuperAdminFinanceService.listTransactions(type, {
        status,
        method,
        userId,
        bankAccountId,
        from,
        to,
        page,
        pageSize,
      })
      return NextResponse.json({ success: true, data })
    }
  )
}
