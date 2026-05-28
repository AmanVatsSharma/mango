/**
 * @file route.ts
 * @module admin-console
 * @description API for admin audit trail: authentication events and platform trading logs, optional summary metrics.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-20 — Dual source (auth + trading), service layer, summary query param.
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  normalizeAdminListDateFilter,
  normalizeAdminListLimitParam,
  normalizeAdminListPageParam,
} from "@/lib/server/admin-list-query-number-utils"
import { AuditTrailService } from "@/lib/services/admin/audit-trail.service"

function normalizeSource(raw: string | null): "auth" | "trading" {
  if (raw === "trading") return "trading"
  return "auth"
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/audit",
      required: "admin.audit.read",
      fallbackMessage: "Failed to fetch audit logs",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const page = normalizeAdminListPageParam(searchParams.get("page"))
      const limit = normalizeAdminListLimitParam(searchParams.get("limit"), 50, 2000)
      const source = normalizeSource(searchParams.get("source"))
      const search = searchParams.get("search") || undefined
      const severity = searchParams.get("severity") || undefined
      const status = searchParams.get("status") || undefined
      const action = searchParams.get("action") || undefined
      const category = searchParams.get("category") || undefined
      const level = searchParams.get("level") || undefined
      const clientId = searchParams.get("clientId") || undefined
      const userId = searchParams.get("userId") || undefined
      const summaryFlag = searchParams.get("summary") === "1" || searchParams.get("summary") === "true"
      const dateFromRaw = searchParams.get("dateFrom")
      const dateToRaw = searchParams.get("dateTo")
      const dateFrom = normalizeAdminListDateFilter(dateFromRaw)
      const dateTo = normalizeAdminListDateFilter(dateToRaw)

      if (dateFromRaw !== null && dateFromRaw.trim() !== "" && !dateFrom) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid dateFrom filter",
          statusCode: 400,
        })
      }
      if (dateToRaw !== null && dateToRaw.trim() !== "" && !dateTo) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid dateTo filter",
          statusCode: 400,
        })
      }

      ctx.logger.debug(
        {
          page,
          limit,
          source,
          search,
          severity,
          status,
          action,
          category,
          level,
          clientId,
          userId,
          dateFrom,
          dateTo,
          summaryFlag,
        },
        "GET /api/admin/audit - params"
      )

      const baseFilters = {
        page,
        limit,
        search,
        severity,
        status,
        action,
        dateFrom,
        dateTo,
        category,
        level,
        clientId,
        userId,
      }

      const listPromise =
        source === "trading"
          ? AuditTrailService.listTrading(baseFilters)
          : AuditTrailService.listAuth(baseFilters)

      const summaryPromise = summaryFlag ? AuditTrailService.getSummary() : Promise.resolve(null)

      const [result, summary] = await Promise.all([listPromise, summaryPromise])

      const logs = result.logs.map((row) => ({
        id: row.id,
        source: row.source,
        timestamp: row.timestamp,
        userId: row.userId,
        userName: row.userName,
        clientId: row.clientId,
        action: row.action,
        resource: row.resource,
        resourceId: row.resourceId,
        message: row.message,
        details: row.details,
        summary: row.summary,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        severity: row.displaySeverity,
        level: row.level,
        category: row.category,
        status: row.status,
        rawMetadata: row.rawMetadata,
        rawDetails: row.rawDetails,
        error: row.error,
        stackTrace: row.stackTrace,
      }))

      ctx.logger.info(
        { count: logs.length, total: result.total, page, source },
        "GET /api/admin/audit - success"
      )

      return NextResponse.json(
        {
          source,
          logs,
          total: result.total,
          pages: result.pages,
          page: result.page,
          ...(summary ? { summary } : {}),
        },
        { status: 200 }
      )
    }
  )
}
