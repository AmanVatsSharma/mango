/**
 * @file route.ts
 * @module admin-console
 * @description API route for updating individual platform-wide risk configurations
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 * @updated 2026-04-08 — RiskConfig `minMarginPerLot`.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  normalizeAdminRiskOptionalBoolean,
  normalizeAdminRiskOptionalNullableNonNegativeInteger,
  normalizeAdminRiskOptionalNullableNonNegativeNumber,
  normalizeAdminRiskOutputNullableNumber,
  normalizeAdminRiskOutputNumber,
  normalizeAdminRiskRequiredPositiveNumber,
} from "@/lib/server/admin-risk-number-utils"
import {
  isAllowedRiskConfigProductType,
  isAllowedRiskConfigSegment,
} from "@/lib/services/risk/risk-config-normalizer"
import { logRiskConfigAdminChange } from "@/lib/services/risk/risk-config-admin-audit"
// Trading-ee3: bust the in-process cache + fan out via Redis pub/sub on admin writes.
import { bustRiskConfigCache } from "@/lib/services/risk/risk-config-cache"

/**
 * PUT /api/admin/risk/config/[id]
 * Update a platform-wide risk configuration
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/config/[id]",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to update risk config",
    },
    async (ctx) => {
      const configId = params.id?.trim()
      if (!configId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "config id is required", statusCode: 400 })
      }
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }
      const {
        segment,
        productType,
        leverage,
        brokerageFlat,
        brokerageRate,
        brokerageCap,
        marginRate,
        minMarginPerLot,
        maxOrderValue,
        maxPositions,
        active,
      } = body

      const normalizedSegment = typeof segment === "string" ? segment.trim().toUpperCase() : undefined
      const normalizedProductType = typeof productType === "string" ? productType.trim().toUpperCase() : undefined
      const normalizedLeverage = leverage !== undefined ? normalizeAdminRiskRequiredPositiveNumber(leverage) : undefined
      const normalizedBrokerageFlat = normalizeAdminRiskOptionalNullableNonNegativeNumber(brokerageFlat)
      const normalizedBrokerageRate = normalizeAdminRiskOptionalNullableNonNegativeNumber(brokerageRate)
      const normalizedBrokerageCap = normalizeAdminRiskOptionalNullableNonNegativeNumber(brokerageCap)
      const normalizedMarginRate = normalizeAdminRiskOptionalNullableNonNegativeNumber(marginRate)
      const normalizedMinMarginPerLot = normalizeAdminRiskOptionalNullableNonNegativeNumber(minMarginPerLot)
      const normalizedMaxOrderValue = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxOrderValue)
      const normalizedMaxPositions = normalizeAdminRiskOptionalNullableNonNegativeInteger(maxPositions)
      const normalizedActive = normalizeAdminRiskOptionalBoolean(active)

      ctx.logger.debug({ configId, segment: normalizedSegment, productType: normalizedProductType }, "PUT /api/admin/risk/config/[id] - request")

      if (segment !== undefined && !normalizedSegment) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "segment cannot be blank", statusCode: 400 })
      }
      if (productType !== undefined && !normalizedProductType) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "productType cannot be blank", statusCode: 400 })
      }
      if (leverage !== undefined && normalizedLeverage === null) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "leverage must be greater than 0", statusCode: 400 })
      }
      if (
        !normalizedBrokerageFlat.valid ||
        !normalizedBrokerageRate.valid ||
        !normalizedBrokerageCap.valid ||
        !normalizedMarginRate.valid ||
        !normalizedMinMarginPerLot.valid ||
        !normalizedMaxOrderValue.valid
      ) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Brokerage/margin/min-margin-per-lot/order-value fields must be non-negative numbers or null",
          statusCode: 400,
        })
      }
      if (!normalizedMaxPositions.valid) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "maxPositions must be a non-negative integer or null",
          statusCode: 400,
        })
      }
      if (!normalizedActive.valid) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "active must be a boolean",
          statusCode: 400,
        })
      }

      const existing = await prisma.riskConfig.findUnique({
        where: { id: configId },
      })

      if (!existing) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "Risk config not found",
          statusCode: 404,
        })
      }

      // If segment or productType is being changed, check for conflicts
      if (
        (normalizedSegment && normalizedSegment !== existing.segment) ||
        (normalizedProductType && normalizedProductType !== existing.productType)
      ) {
        const newSegment = normalizedSegment || existing.segment
        const newProductType = normalizedProductType || existing.productType

        const conflict = await prisma.riskConfig.findUnique({
          where: {
            segment_productType: {
              segment: newSegment,
              productType: newProductType,
            },
          },
        })

        if (conflict && conflict.id !== configId) {
          throw new AppError({
            code: "CONFLICT_ERROR",
            message: "Risk config already exists for this segment and product type",
            statusCode: 409,
          })
        }
      }

      if (normalizedSegment !== undefined && !isAllowedRiskConfigSegment(normalizedSegment)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Unknown segment "${normalizedSegment}". Use NSE, NFO, BSE, MCX, or related exchange codes.`,
          statusCode: 400,
        })
      }
      if (normalizedProductType !== undefined && !isAllowedRiskConfigProductType(normalizedProductType)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Unknown productType "${normalizedProductType}". Use MIS, CNC, NRML, NRML_FUT, NRML_OPT, NRML_OPT_BUY, NRML_OPT_SELL, MIS_FUT, MIS_OPT, MIS_OPT_BUY, MIS_OPT_SELL, INTRADAY, DELIVERY, OPT, FUT.`,
          statusCode: 400,
        })
      }

      const updateData: any = {}
      if (normalizedSegment !== undefined) updateData.segment = normalizedSegment
      if (normalizedProductType !== undefined) updateData.productType = normalizedProductType
      if (normalizedLeverage !== undefined) updateData.leverage = new Prisma.Decimal(normalizedLeverage)
      if (normalizedBrokerageFlat.provided)
        updateData.brokerageFlat =
          normalizedBrokerageFlat.value !== null ? new Prisma.Decimal(normalizedBrokerageFlat.value) : null
      if (normalizedBrokerageRate.provided)
        updateData.brokerageRate =
          normalizedBrokerageRate.value !== null ? new Prisma.Decimal(normalizedBrokerageRate.value) : null
      if (normalizedBrokerageCap.provided)
        updateData.brokerageCap =
          normalizedBrokerageCap.value !== null ? new Prisma.Decimal(normalizedBrokerageCap.value) : null
      if (normalizedMarginRate.provided)
        updateData.marginRate =
          normalizedMarginRate.value !== null ? new Prisma.Decimal(normalizedMarginRate.value) : null
      if (normalizedMinMarginPerLot.provided)
        updateData.minMarginPerLot =
          normalizedMinMarginPerLot.value !== null ? new Prisma.Decimal(normalizedMinMarginPerLot.value) : null
      if (normalizedMaxOrderValue.provided)
        updateData.maxOrderValue =
          normalizedMaxOrderValue.value !== null ? new Prisma.Decimal(normalizedMaxOrderValue.value) : null
      if (normalizedMaxPositions.provided) updateData.maxPositions = normalizedMaxPositions.value
      if (normalizedActive.provided) updateData.active = normalizedActive.value

      const updated = await prisma.riskConfig.update({
        where: { id: configId },
        data: updateData,
      })

      ctx.logger.info({ configId: updated.id }, "PUT /api/admin/risk/config/[id] - success")

      // Trading-ee3: cache bust → MarginCalculator picks the new leverage/margin on next order.
      await bustRiskConfigCache({ configId: updated.id, summary: "updated" })

      const adminUserId = (ctx.session?.user as { id?: string } | undefined)?.id ?? null
      await logRiskConfigAdminChange({
        action: "RISK_CONFIG_UPDATED",
        adminUserId,
        requestId: ctx.req.headers.get("x-request-id"),
        before: {
          id: existing.id,
          segment: existing.segment,
          productType: existing.productType,
          leverage: normalizeAdminRiskOutputNumber(existing.leverage),
          marginRate: normalizeAdminRiskOutputNullableNumber(existing.marginRate),
          minMarginPerLot: normalizeAdminRiskOutputNullableNumber(existing.minMarginPerLot),
          active: existing.active,
        },
        after: {
          id: updated.id,
          segment: updated.segment,
          productType: updated.productType,
          leverage: normalizeAdminRiskOutputNumber(updated.leverage),
          marginRate: normalizeAdminRiskOutputNullableNumber(updated.marginRate),
          minMarginPerLot: normalizeAdminRiskOutputNullableNumber(updated.minMarginPerLot),
          active: updated.active,
        },
      })

      return NextResponse.json(
        {
          success: true,
          message: "Risk config updated successfully",
          config: {
            id: updated.id,
            segment: updated.segment,
            productType: updated.productType,
            leverage: normalizeAdminRiskOutputNumber(updated.leverage),
            brokerageFlat: normalizeAdminRiskOutputNullableNumber(updated.brokerageFlat),
            brokerageRate: normalizeAdminRiskOutputNullableNumber(updated.brokerageRate),
            brokerageCap: normalizeAdminRiskOutputNullableNumber(updated.brokerageCap),
            marginRate: normalizeAdminRiskOutputNullableNumber(updated.marginRate),
            minMarginPerLot: normalizeAdminRiskOutputNullableNumber(updated.minMarginPerLot),
            maxOrderValue: normalizeAdminRiskOutputNullableNumber(updated.maxOrderValue),
            maxPositions: updated.maxPositions,
            active: updated.active,
            updatedAt: updated.updatedAt,
          },
        },
        { status: 200 }
      )
    }
  )
}

/**
 * GET /api/admin/risk/config/[id]
 * Get a specific risk configuration
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/config/[id]",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk config",
    },
    async (ctx) => {
      const configId = params.id?.trim()
      if (!configId) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "config id is required", statusCode: 400 })
      }
      ctx.logger.debug({ configId }, "GET /api/admin/risk/config/[id] - request")

      const config = await prisma.riskConfig.findUnique({
        where: { id: configId },
      })

      if (!config) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "Risk config not found",
          statusCode: 404,
        })
      }

      return NextResponse.json(
        {
          success: true,
          config: {
            id: config.id,
            segment: config.segment,
            productType: config.productType,
            leverage: normalizeAdminRiskOutputNumber(config.leverage),
            brokerageFlat: normalizeAdminRiskOutputNullableNumber(config.brokerageFlat),
            brokerageRate: normalizeAdminRiskOutputNullableNumber(config.brokerageRate),
            brokerageCap: normalizeAdminRiskOutputNullableNumber(config.brokerageCap),
            marginRate: normalizeAdminRiskOutputNullableNumber(config.marginRate),
            minMarginPerLot: normalizeAdminRiskOutputNullableNumber(config.minMarginPerLot),
            maxOrderValue: normalizeAdminRiskOutputNullableNumber(config.maxOrderValue),
            maxPositions: config.maxPositions,
            active: config.active,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
          },
        },
        { status: 200 }
      )
    }
  )
}
