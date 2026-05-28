/**
 * File:        app/api/admin/users/[userId]/risk-limit/route.ts
 * Module:      Admin Console · User Risk Limit
 * Purpose:     GET + PUT per-user RiskLimit including five nullable threshold overrides;
 *              NULL threshold fields mean "inherit global RiskConfig value".
 *
 * Exports:
 *   - GET(req, { params })  — fetch RiskLimit + baseConfigs for a single user
 *   - PUT(req, { params })  — upsert RiskLimit with optional threshold overrides
 *
 * Depends on:
 *   - @/lib/prisma                      — DB access
 *   - @/lib/rbac/admin-api              — auth + logging middleware
 *   - @/lib/server/admin-risk-number-utils — numeric normalizers for legacy fields
 *   - zod                               — validation for new threshold fields
 *
 * Side-effects:
 *   - DB read/write via prisma.riskLimit.findUnique / upsert
 *
 * Key invariants:
 *   - Threshold percentage fields are validated 0..100 via Zod then stored as-is
 *   - Fields absent from the request body are stored as NULL (clears per-user override)
 *   - maxDailyLossInr is a separate nullable override distinct from the required maxDailyLoss field
 *
 * Read order:
 *   1. thresholdSchema — new threshold field validation
 *   2. GET — fetch handler
 *   3. PUT — upsert handler
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { z } from "zod"
import {
  normalizeAdminRiskOptionalNullableNonNegativeInteger,
  normalizeAdminRiskOptionalNullableNonNegativeNumber,
  normalizeAdminRiskOutputNumber,
  normalizeAdminRiskOutputNullableNumber,
} from "@/lib/server/admin-risk-number-utils"

const thresholdSchema = z.object({
  riskLevelLowPct:    z.number().min(0).max(100).optional(),
  riskLevelMediumPct: z.number().min(0).max(100).optional(),
  riskLevelHighPct:   z.number().min(0).max(100).optional(),
  autoCloseLevelPct:  z.number().min(0).max(100).optional(),
  maxDailyLossInr:    z.number().min(0).optional(),
})

/**
 * GET /api/admin/users/[userId]/risk-limit
 * Fetch user risk limit with base leverage information
 */
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/risk-limit`,
      required: "admin.users.risk",
      fallbackMessage: "Failed to fetch risk limit",
    },
    async (ctx) => {
      const userId = params.userId?.trim()
      if (!userId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "userId is required", statusCode: 400 })
      }

      ctx.logger.debug({ userId }, "GET /api/admin/users/[userId]/risk-limit - request")

      const riskLimit = await prisma.riskLimit.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      const baseConfigs = await prisma.riskConfig.findMany({
        where: { active: true },
        select: {
          segment: true,
          productType: true,
          leverage: true,
        },
      })

      ctx.logger.info({ userId, hasRiskLimit: !!riskLimit }, "GET /api/admin/users/[userId]/risk-limit - success")

      return NextResponse.json(
        {
          success: true,
          riskLimit: riskLimit
            ? {
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
              }
            : null,
          baseConfigs: baseConfigs.map((c) => ({
            segment: c.segment,
            productType: c.productType,
            leverage: normalizeAdminRiskOutputNumber(c.leverage),
          })),
        },
        { status: 200 }
      )
    }
  )
}

/**
 * PUT /api/admin/users/[userId]/risk-limit
 * Update user risk limit with leverage override
 */
export async function PUT(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/risk-limit`,
      required: "admin.users.risk",
      fallbackMessage: "Failed to update risk limit",
    },
    async (ctx) => {
      const userId = params.userId?.trim()
      if (!userId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "userId is required", statusCode: 400 })
      }
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }

      // Validate threshold override fields via Zod (absent = NULL, clears override)
      const thresholdParsed = thresholdSchema.safeParse(body)
      if (!thresholdParsed.success) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Invalid threshold fields: ${thresholdParsed.error.issues.map((i) => i.message).join(", ")}`,
          statusCode: 400,
        })
      }
      const thresholds = thresholdParsed.data

      const { maxDailyLoss, maxPositionSize, maxLeverage, maxDailyTrades, leverageMultiplier } = body
      const normalizedMaxDailyLoss = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxDailyLoss)
      const normalizedMaxPositionSize = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxPositionSize)
      const normalizedMaxLeverage = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxLeverage)
      const normalizedMaxDailyTrades = normalizeAdminRiskOptionalNullableNonNegativeInteger(maxDailyTrades)
      const normalizedLeverageMultiplier = normalizeAdminRiskOptionalNullableNonNegativeNumber(leverageMultiplier)

      ctx.logger.debug({ userId }, "PUT /api/admin/users/[userId]/risk-limit - request")

      if (!normalizedMaxDailyLoss.valid || !normalizedMaxPositionSize.valid || !normalizedMaxLeverage.valid || !normalizedLeverageMultiplier.valid) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Risk numeric fields must be non-negative numbers",
          statusCode: 400,
        })
      }
      if (!normalizedMaxDailyTrades.valid) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "maxDailyTrades must be a non-negative integer",
          statusCode: 400,
        })
      }
      if (
        (normalizedMaxDailyLoss.provided && normalizedMaxDailyLoss.value === null) ||
        (normalizedMaxPositionSize.provided && normalizedMaxPositionSize.value === null) ||
        (normalizedMaxLeverage.provided && normalizedMaxLeverage.value === null) ||
        (normalizedLeverageMultiplier.provided && normalizedLeverageMultiplier.value === null) ||
        (normalizedMaxDailyTrades.provided && normalizedMaxDailyTrades.value === null)
      ) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Risk numeric fields cannot be null",
          statusCode: 400,
        })
      }

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        throw new AppError({
          code: "USER_NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      let finalMaxLeverage = normalizedMaxLeverage.value ?? undefined
      if (normalizedLeverageMultiplier.provided && normalizedLeverageMultiplier.value !== null) {
        const baseConfigs = await prisma.riskConfig.findMany({
          where: { active: true },
          select: { leverage: true },
        })

        if (baseConfigs.length > 0) {
          const avgBaseLeverage =
            baseConfigs.reduce((sum: number, c: any) => sum + normalizeAdminRiskOutputNumber(c.leverage), 0) /
            baseConfigs.length
          finalMaxLeverage = avgBaseLeverage * normalizedLeverageMultiplier.value
          ctx.logger.debug(
            { avgBaseLeverage, leverageMultiplier: normalizedLeverageMultiplier.value, finalMaxLeverage },
            "PUT /api/admin/users/[userId]/risk-limit - leverage calculated"
          )
        }
      }

      const riskLimit = await prisma.riskLimit.upsert({
        where: { userId },
        update: {
          maxDailyLoss:
            normalizedMaxDailyLoss.provided && normalizedMaxDailyLoss.value !== null
              ? new Prisma.Decimal(normalizedMaxDailyLoss.value)
              : undefined,
          maxPositionSize:
            normalizedMaxPositionSize.provided && normalizedMaxPositionSize.value !== null
              ? new Prisma.Decimal(normalizedMaxPositionSize.value)
              : undefined,
          maxLeverage: finalMaxLeverage !== undefined ? new Prisma.Decimal(finalMaxLeverage) : undefined,
          maxDailyTrades:
            normalizedMaxDailyTrades.provided && normalizedMaxDailyTrades.value !== null
              ? normalizedMaxDailyTrades.value
              : undefined,
          riskLevelLowPct:    thresholds.riskLevelLowPct ?? null,
          riskLevelMediumPct: thresholds.riskLevelMediumPct ?? null,
          riskLevelHighPct:   thresholds.riskLevelHighPct ?? null,
          autoCloseLevelPct:  thresholds.autoCloseLevelPct ?? null,
          maxDailyLossInr:    thresholds.maxDailyLossInr !== undefined
            ? new Prisma.Decimal(thresholds.maxDailyLossInr)
            : null,
          updatedAt: new Date(),
        },
        create: {
          userId,
          maxDailyLoss: new Prisma.Decimal(normalizedMaxDailyLoss.value ?? 0),
          maxPositionSize: new Prisma.Decimal(normalizedMaxPositionSize.value ?? 0),
          maxLeverage: new Prisma.Decimal(finalMaxLeverage ?? 1),
          maxDailyTrades: normalizedMaxDailyTrades.value ?? 0,
          status: "ACTIVE",
          riskLevelLowPct:    thresholds.riskLevelLowPct ?? null,
          riskLevelMediumPct: thresholds.riskLevelMediumPct ?? null,
          riskLevelHighPct:   thresholds.riskLevelHighPct ?? null,
          autoCloseLevelPct:  thresholds.autoCloseLevelPct ?? null,
          maxDailyLossInr:    thresholds.maxDailyLossInr !== undefined
            ? new Prisma.Decimal(thresholds.maxDailyLossInr)
            : null,
        },
      })

      ctx.logger.info({ userId, riskLimitId: riskLimit.id }, "PUT /api/admin/users/[userId]/risk-limit - success")

      return NextResponse.json(
        {
          success: true,
          message: "Risk limit updated successfully",
          riskLimit: {
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
