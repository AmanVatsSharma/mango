/**
 * File:        app/api/admin/risk/limits/route.ts
 * Module:      Admin Console · Risk Management · Limits
 * Purpose:     GET all per-user RiskLimit rows; POST to create/upsert a new limit
 *              including the five optional threshold override fields.
 *
 * Exports:
 *   - GET(req)  — fetch all risk limits with user info
 *   - POST(req) — create/upsert a per-user risk limit
 *
 * Depends on:
 *   - @/lib/prisma                          — DB access
 *   - @/lib/rbac/admin-api                  — auth + logging middleware
 *   - @/lib/server/admin-risk-number-utils  — numeric normalizers
 *
 * Side-effects:
 *   - DB read/write via prisma.riskLimit.findMany / upsert
 *
 * Key invariants:
 *   - Threshold override fields are optional; absent = store null (inherit global)
 *   - Threshold percentages are validated 0..100
 *
 * Read order:
 *   1. GET — fetch all limits
 *   2. POST — create/upsert limit
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
  normalizeAdminRiskOutputNumber,
  normalizeAdminRiskOutputNullableNumber,
  normalizeAdminRiskRequiredNonNegativeInteger,
  normalizeAdminRiskRequiredNonNegativeNumber,
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

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/limits",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk limits",
    },
    async (ctx) => {
      ctx.logger.debug({}, "GET /api/admin/risk/limits - start")

      const limits = await prisma.riskLimit.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              clientId: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      })

      const formattedLimits = limits.map((limit) => ({
        id: limit.id,
        userId: limit.userId,
        userName: limit.user.name || limit.user.email || "Unknown",
        maxDailyLoss: normalizeAdminRiskOutputNumber(limit.maxDailyLoss),
        maxPositionSize: normalizeAdminRiskOutputNumber(limit.maxPositionSize),
        maxLeverage: normalizeAdminRiskOutputNumber(limit.maxLeverage),
        maxDailyTrades: limit.maxDailyTrades,
        status: limit.status,
        lastUpdated: limit.updatedAt,
        riskLevelLowPct: limit.riskLevelLowPct ?? null,
        riskLevelMediumPct: limit.riskLevelMediumPct ?? null,
        riskLevelHighPct: limit.riskLevelHighPct ?? null,
        autoCloseLevelPct: limit.autoCloseLevelPct ?? null,
        maxDailyLossInr: normalizeAdminRiskOutputNullableNumber(limit.maxDailyLossInr),
      }))

      ctx.logger.info({ count: formattedLimits.length }, "GET /api/admin/risk/limits - success")

      return NextResponse.json({ limits: formattedLimits }, { status: 200 })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/limits",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to create risk limit",
    },
    async (ctx) => {
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }
      const { userId, maxDailyLoss, maxPositionSize, maxLeverage, maxDailyTrades,
              riskLevelLowPct, riskLevelMediumPct, riskLevelHighPct, autoCloseLevelPct, maxDailyLossInr } = body
      const normalizedUserId = typeof userId === "string" ? userId.trim() : ""
      const normalizedMaxDailyLoss = normalizeAdminRiskRequiredNonNegativeNumber(maxDailyLoss)
      const normalizedMaxPositionSize = normalizeAdminRiskRequiredNonNegativeNumber(maxPositionSize)
      const normalizedMaxLeverage = normalizeAdminRiskRequiredNonNegativeNumber(maxLeverage)
      const normalizedMaxDailyTrades = normalizeAdminRiskRequiredNonNegativeInteger(maxDailyTrades)
      const normalizedLowPct = normalizeOptionalPct(riskLevelLowPct)
      const normalizedMediumPct = normalizeOptionalPct(riskLevelMediumPct)
      const normalizedHighPct = normalizeOptionalPct(riskLevelHighPct)
      const normalizedAutoClosePct = normalizeOptionalPct(autoCloseLevelPct)
      const normalizedMaxLossInr = normalizeOptionalNonNegative(maxDailyLossInr)

      ctx.logger.debug({ userId: normalizedUserId, maxDailyLoss: normalizedMaxDailyLoss, maxPositionSize: normalizedMaxPositionSize, maxLeverage: normalizedMaxLeverage }, "POST /api/admin/risk/limits - request")

      if (!normalizedUserId || normalizedMaxDailyLoss === null || normalizedMaxPositionSize === null || normalizedMaxLeverage === null || normalizedMaxDailyTrades === null) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "userId, maxDailyLoss, maxPositionSize, maxLeverage, and maxDailyTrades are required and must be non-negative numbers",
          statusCode: 400,
        })
      }

      const user = await prisma.user.findUnique({ where: { id: normalizedUserId } })
      if (!user) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      const riskLimit = await prisma.riskLimit.upsert({
        where: { userId: normalizedUserId },
        update: {
          maxDailyLoss: new Prisma.Decimal(normalizedMaxDailyLoss),
          maxPositionSize: new Prisma.Decimal(normalizedMaxPositionSize),
          maxLeverage: new Prisma.Decimal(normalizedMaxLeverage),
          maxDailyTrades: normalizedMaxDailyTrades,
          riskLevelLowPct: normalizedLowPct,
          riskLevelMediumPct: normalizedMediumPct,
          riskLevelHighPct: normalizedHighPct,
          autoCloseLevelPct: normalizedAutoClosePct,
          maxDailyLossInr: normalizedMaxLossInr !== null ? new Prisma.Decimal(normalizedMaxLossInr) : null,
          updatedAt: new Date(),
        },
        create: {
          userId: normalizedUserId,
          maxDailyLoss: new Prisma.Decimal(normalizedMaxDailyLoss),
          maxPositionSize: new Prisma.Decimal(normalizedMaxPositionSize),
          maxLeverage: new Prisma.Decimal(normalizedMaxLeverage),
          maxDailyTrades: normalizedMaxDailyTrades,
          status: "ACTIVE",
          riskLevelLowPct: normalizedLowPct,
          riskLevelMediumPct: normalizedMediumPct,
          riskLevelHighPct: normalizedHighPct,
          autoCloseLevelPct: normalizedAutoClosePct,
          maxDailyLossInr: normalizedMaxLossInr !== null ? new Prisma.Decimal(normalizedMaxLossInr) : null,
        },
      })

      ctx.logger.info({ limitId: riskLimit.id, userId: normalizedUserId }, "POST /api/admin/risk/limits - success")

      return NextResponse.json(
        {
          success: true,
          message: "Risk limit created successfully",
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
        { status: 201 }
      )
    }
  )
}
