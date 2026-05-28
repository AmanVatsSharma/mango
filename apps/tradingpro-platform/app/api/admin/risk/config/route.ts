/**
 * @file route.ts
 * @module admin-console
 * @description API route for platform-wide risk configuration management (RiskConfig)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 * @updated 2026-04-08 — RiskConfig `minMarginPerLot` (short-option per-lot floor).
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
// Trading-ee3: bust the in-process cache + fan out via Redis pub/sub on admin writes so
// MarginCalculator and the order engine see new values within milliseconds, not 30s.
import { bustRiskConfigCache } from "@/lib/services/risk/risk-config-cache"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/risk/config
 * Fetch all platform-wide risk configurations
 */
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/config",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch risk configs",
    },
    async (ctx) => {
      ctx.logger.debug({}, "GET /api/admin/risk/config - start")

      const configs = await prisma.riskConfig.findMany({
        orderBy: [{ segment: "asc" }, { productType: "asc" }],
      })

      const formattedConfigs = configs.map((config) => ({
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
      }))

      ctx.logger.info({ count: formattedConfigs.length }, "GET /api/admin/risk/config - success")

      return NextResponse.json({ success: true, configs: formattedConfigs }, { status: 200 })
    }
  )
}

/**
 * POST /api/admin/risk/config
 * Create a new platform-wide risk configuration
 */
export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/config",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to create risk config",
    },
    async (ctx) => {
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          statusCode: 400,
        })
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
        active = true,
      } = body

      const normalizedSegment = typeof segment === "string" ? segment.trim().toUpperCase() : ""
      const normalizedProductType = typeof productType === "string" ? productType.trim().toUpperCase() : ""
      const normalizedLeverage = normalizeAdminRiskRequiredPositiveNumber(leverage)
      const normalizedBrokerageFlat = normalizeAdminRiskOptionalNullableNonNegativeNumber(brokerageFlat)
      const normalizedBrokerageRate = normalizeAdminRiskOptionalNullableNonNegativeNumber(brokerageRate)
      const normalizedBrokerageCap = normalizeAdminRiskOptionalNullableNonNegativeNumber(brokerageCap)
      const normalizedMarginRate = normalizeAdminRiskOptionalNullableNonNegativeNumber(marginRate)
      const normalizedMinMarginPerLot = normalizeAdminRiskOptionalNullableNonNegativeNumber(minMarginPerLot)
      const normalizedMaxOrderValue = normalizeAdminRiskOptionalNullableNonNegativeNumber(maxOrderValue)
      const normalizedMaxPositions = normalizeAdminRiskOptionalNullableNonNegativeInteger(maxPositions)
      const normalizedActive = normalizeAdminRiskOptionalBoolean(active)

      ctx.logger.debug({ segment: normalizedSegment, productType: normalizedProductType, leverage: normalizedLeverage }, "POST /api/admin/risk/config - request")

      // Validate required fields
      if (!normalizedSegment || !normalizedProductType || normalizedLeverage === null) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "segment, productType, and leverage (> 0) are required",
          statusCode: 400,
        })
      }
      if (!isAllowedRiskConfigSegment(normalizedSegment)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Unknown segment "${normalizedSegment}". Use NSE, NFO, BSE, MCX, or related exchange codes.`,
          statusCode: 400,
        })
      }
      if (!isAllowedRiskConfigProductType(normalizedProductType)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Unknown productType "${normalizedProductType}". Use MIS, CNC, NRML, NRML_FUT, NRML_OPT, NRML_OPT_BUY, NRML_OPT_SELL, MIS_FUT, MIS_OPT, MIS_OPT_BUY, MIS_OPT_SELL, INTRADAY, DELIVERY, OPT, FUT.`,
          statusCode: 400,
        })
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

      // Check if config already exists
      const existing = await prisma.riskConfig.findUnique({
        where: {
          segment_productType: {
            segment: normalizedSegment,
            productType: normalizedProductType,
          },
        },
      })

      if (existing) {
        throw new AppError({
          code: "CONFLICT_ERROR",
          message: "Risk config already exists for this segment and product type",
          statusCode: 409,
        })
      }

      const riskConfig = await prisma.riskConfig.create({
        data: {
          segment: normalizedSegment,
          productType: normalizedProductType,
          leverage: new Prisma.Decimal(normalizedLeverage),
          brokerageFlat:
            normalizedBrokerageFlat.provided && normalizedBrokerageFlat.value !== null
              ? new Prisma.Decimal(normalizedBrokerageFlat.value)
              : null,
          brokerageRate:
            normalizedBrokerageRate.provided && normalizedBrokerageRate.value !== null
              ? new Prisma.Decimal(normalizedBrokerageRate.value)
              : null,
          brokerageCap:
            normalizedBrokerageCap.provided && normalizedBrokerageCap.value !== null
              ? new Prisma.Decimal(normalizedBrokerageCap.value)
              : null,
          marginRate:
            normalizedMarginRate.provided && normalizedMarginRate.value !== null
              ? new Prisma.Decimal(normalizedMarginRate.value)
              : null,
          minMarginPerLot:
            normalizedMinMarginPerLot.provided && normalizedMinMarginPerLot.value !== null
              ? new Prisma.Decimal(normalizedMinMarginPerLot.value)
              : null,
          maxOrderValue:
            normalizedMaxOrderValue.provided && normalizedMaxOrderValue.value !== null
              ? new Prisma.Decimal(normalizedMaxOrderValue.value)
              : null,
          maxPositions: normalizedMaxPositions.value,
          active: normalizedActive.value ?? true,
        },
      })

      ctx.logger.info({ configId: riskConfig.id }, "POST /api/admin/risk/config - success")

      // Trading-ee3: bust local + remote caches so MarginCalculator picks up the new row on
      // the very next order — not 30s later.
      await bustRiskConfigCache({ configId: riskConfig.id, summary: "created" })

      const adminUserId = (ctx.session?.user as { id?: string } | undefined)?.id ?? null
      await logRiskConfigAdminChange({
        action: "RISK_CONFIG_CREATED",
        adminUserId,
        requestId: ctx.req.headers.get("x-request-id"),
        after: {
          id: riskConfig.id,
          segment: riskConfig.segment,
          productType: riskConfig.productType,
          leverage: normalizeAdminRiskOutputNumber(riskConfig.leverage),
          marginRate: normalizeAdminRiskOutputNullableNumber(riskConfig.marginRate),
          minMarginPerLot: normalizeAdminRiskOutputNullableNumber(riskConfig.minMarginPerLot),
          active: riskConfig.active,
        },
      })

      return NextResponse.json(
        {
          success: true,
          message: "Risk config created successfully",
          config: {
            id: riskConfig.id,
            segment: riskConfig.segment,
            productType: riskConfig.productType,
            leverage: normalizeAdminRiskOutputNumber(riskConfig.leverage),
            brokerageFlat: normalizeAdminRiskOutputNullableNumber(riskConfig.brokerageFlat),
            brokerageRate: normalizeAdminRiskOutputNullableNumber(riskConfig.brokerageRate),
            brokerageCap: normalizeAdminRiskOutputNullableNumber(riskConfig.brokerageCap),
            marginRate: normalizeAdminRiskOutputNullableNumber(riskConfig.marginRate),
            minMarginPerLot: normalizeAdminRiskOutputNullableNumber(riskConfig.minMarginPerLot),
            maxOrderValue: normalizeAdminRiskOutputNullableNumber(riskConfig.maxOrderValue),
            maxPositions: riskConfig.maxPositions,
            active: riskConfig.active,
          },
        },
        { status: 201 }
      )
    }
  )
}
