/**
 * File:        app/api/admin/risk/limits/[id]/route.ts
 * Module:      Admin Console · Risk Management · Limits (by ID)
 * Purpose:     PUT per-user RiskLimit by record ID, including five optional threshold overrides.
 *
 * Exports:
 *   - PUT(req, { params })  — partial update a RiskLimit record by its id
 *
 * Depends on:
 *   - @/lib/prisma                          — DB access
 *   - @/lib/rbac/admin-api                  — auth + logging middleware
 *   - @/lib/server/admin-risk-number-utils  — numeric normalizers
 *
 * Side-effects:
 *   - DB write via prisma.riskLimit.update
 *
 * Key invariants:
 *   - Threshold override fields are optional; absent = store null (inherit global)
 *   - Threshold percentages are validated 0..100
 *
 * Read order:
 *   1. PUT — partial update handler
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  normalizeAdminRiskOptionalNullableNonNegativeInteger,
  normalizeAdminRiskOptionalNullableNonNegativeNumber,
  normalizeAdminRiskOutputNumber,
  normalizeAdminRiskOutputNullableNumber,
} from "@/lib/server/admin-risk-number-utils"

function normalizeOptionalPct(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

function normalizeOptionalNonNegative(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/limits/[id]",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to update risk limit",
    },
    async (ctx) => {
      const id = params.id?.trim()
      if (!id) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "limit id is required", statusCode: 400 })
      }
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }
      const { maxDailyLoss, maxPositionSize, maxLeverage, maxDailyTrades, status,
              riskLevelLowPct, riskLevelMediumPct, riskLevelHighPct, autoCloseLevelPct, maxDailyLossInr } = body
      const normalizedMaxDailyLoss = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxDailyLoss)
      const normalizedMaxPositionSize = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxPositionSize)
      const normalizedMaxLeverage = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxLeverage)
      const normalizedMaxDailyTrades = normalizeAdminRiskOptionalNullableNonNegativeInteger(maxDailyTrades)
      const normalizedStatus = typeof status === "string" ? status.trim().toUpperCase() : undefined
      const normalizedLowPct = normalizeOptionalPct(riskLevelLowPct)
      const normalizedMediumPct = normalizeOptionalPct(riskLevelMediumPct)
      const normalizedHighPct = normalizeOptionalPct(riskLevelHighPct)
      const normalizedAutoClosePct = normalizeOptionalPct(autoCloseLevelPct)
      const normalizedMaxLossInr = normalizeOptionalNonNegative(maxDailyLossInr)

      ctx.logger.debug({ limitId: id }, "PUT /api/admin/risk/limits/[id] - request")

      if (!normalizedMaxDailyLoss.valid || !normalizedMaxPositionSize.valid || !normalizedMaxLeverage.valid) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "maxDailyLoss/maxPositionSize/maxLeverage must be non-negative numbers or null",
          statusCode: 400,
        })
      }
      if (!normalizedMaxDailyTrades.valid) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "maxDailyTrades must be a non-negative integer or null",
          statusCode: 400,
        })
      }
      if (
        (normalizedMaxDailyLoss.provided && normalizedMaxDailyLoss.value === null) ||
        (normalizedMaxPositionSize.provided && normalizedMaxPositionSize.value === null) ||
        (normalizedMaxLeverage.provided && normalizedMaxLeverage.value === null) ||
        (normalizedMaxDailyTrades.provided && normalizedMaxDailyTrades.value === null)
      ) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Risk limit numeric fields cannot be null",
          statusCode: 400,
        })
      }
      if (status !== undefined && !["ACTIVE", "SUSPENDED", "WARNING"].includes(normalizedStatus || "")) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "status must be ACTIVE, SUSPENDED, or WARNING",
          statusCode: 400,
        })
      }

      const riskLimit = await prisma.riskLimit.update({
        where: { id },
        data: {
          ...(normalizedMaxDailyLoss.provided && {
            maxDailyLoss: new Prisma.Decimal(normalizedMaxDailyLoss.value as number),
          }),
          ...(normalizedMaxPositionSize.provided && {
            maxPositionSize: new Prisma.Decimal(normalizedMaxPositionSize.value as number),
          }),
          ...(normalizedMaxLeverage.provided && {
            maxLeverage: new Prisma.Decimal(normalizedMaxLeverage.value as number),
          }),
          ...(normalizedMaxDailyTrades.provided && { maxDailyTrades: normalizedMaxDailyTrades.value as number }),
          ...(normalizedStatus !== undefined && { status: normalizedStatus }),
          riskLevelLowPct: normalizedLowPct,
          riskLevelMediumPct: normalizedMediumPct,
          riskLevelHighPct: normalizedHighPct,
          autoCloseLevelPct: normalizedAutoClosePct,
          maxDailyLossInr: normalizedMaxLossInr !== null ? new Prisma.Decimal(normalizedMaxLossInr) : null,
          updatedAt: new Date(),
        },
      })

      ctx.logger.info({ limitId: riskLimit.id }, "PUT /api/admin/risk/limits/[id] - success")

      return NextResponse.json(
        {
          success: true,
          limit: {
            id: riskLimit.id,
            userId: riskLimit.userId,
            maxDailyLoss: normalizeAdminRiskOutputNumber(riskLimit.maxDailyLoss),
            maxPositionSize: normalizeAdminRiskOutputNumber(riskLimit.maxPositionSize),
            maxLeverage: normalizeAdminRiskOutputNumber(riskLimit.maxLeverage),
            maxDailyTrades: riskLimit.maxDailyTrades,
            status: riskLimit.status,
            riskLevelLowPct: riskLimit.riskLevelLowPct ?? null,
            riskLevelMediumPct: riskLimit.riskLevelMediumPct ?? null,
            riskLevelHighPct: riskLimit.riskLevelHighPct ?? null,
            autoCloseLevelPct: riskLimit.autoCloseLevelPct ?? null,
            maxDailyLossInr: normalizeAdminRiskOutputNullableNumber(riskLimit.maxDailyLossInr),
          },
        },
        { status: 200 }
      )
    }
  )
}
