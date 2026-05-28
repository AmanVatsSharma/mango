/**
 * API Route: System Settings
 * 
 * Manages platform-wide settings:
 * - Payment QR code
 * - Payment UPI ID
 * - Platform branding
 * - Notifications
 * 
 * @route GET /api/admin/settings - Get all or specific settings
 * @route POST /api/admin/settings - Create or update setting
 * @route DELETE /api/admin/settings - Delete setting
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { invalidateKycEnforcementCache } from "@/lib/server/kyc-enforcement"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import { assertValidMarketDisplayConfigSettingValue } from "@/lib/server/market-display-settings-validation"
import { assertValidPaymentDepositConfigValue } from "@/lib/server/payment-deposit-config"
import { PAYMENT_DEPOSIT_CONFIG_V1_KEY } from "@/lib/payment-deposit-public"
import {
  assertValidClientRmDisplayPolicySettingValue,
  isClientRmDisplayPolicyKey,
} from "@/lib/server/rm-client-display-policy-validation"
import { invalidateMarketForceClosedCache, invalidateNseHolidaysCache } from "@/lib/server/market-timing"
import { assertValidOrderChargesConfigSettingValue } from "@/lib/server/order-charges-config-validation"
import { invalidateOrderChargesConfigCache } from "@/lib/server/get-order-charges-config"

/**
 * GET - Fetch system settings
 */
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/settings",
      required: "admin.settings.manage",
      fallbackMessage: "Failed to fetch settings",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const key = searchParams.get("key")
      const category = searchParams.get("category")

      ctx.logger.debug({ key, category }, "GET /api/admin/settings - params")

    // Build query (global settings only for now; per-RM scoping will use ownerId in prod DB)
    // NOTE: `SystemSettings.key` is not globally unique. We treat "global" as ownerId = null.
    const where: any = { isActive: true, ownerId: null }
    if (key) where.key = key
    if (category) where.category = category

    // Fetch settings
    const settings = await prisma.systemSettings.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })

      ctx.logger.info({ count: settings.length }, "GET /api/admin/settings - success")

    // If requesting a specific key, return single object
    if (key && settings.length === 1) {
      return NextResponse.json({
        success: true,
        setting: settings[0]
      }, { status: 200 })
    }

    return NextResponse.json({
      success: true,
      settings,
      count: settings.length
    }, { status: 200 })
    }
  )
}

/**
 * POST - Create or update setting
 */
export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/settings",
      required: "admin.settings.manage",
      fallbackMessage: "Failed to save setting",
    },
    async (ctx) => {
      const body = await req.json()
      const { key, value, description, category, isActive } = body

      ctx.logger.debug(
        { key, category, hasValue: typeof value === "string" ? value.length > 0 : Boolean(value) },
        "POST /api/admin/settings - request"
      )

      if (!key || value === undefined || value === null) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Key and value are required",
          statusCode: 400,
        })
      }

      if (key === ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1) {
        assertValidMarketDisplayConfigSettingValue(value)
      }

      if (key === PAYMENT_DEPOSIT_CONFIG_V1_KEY) {
        assertValidPaymentDepositConfigValue(String(value))
      }

      if (isClientRmDisplayPolicyKey(key)) {
        assertValidClientRmDisplayPolicySettingValue(String(value))
      }

      if (key === ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1) {
        assertValidOrderChargesConfigSettingValue(value)
      }

    // "Upsert" setting (global for now).
    // NOTE: `SystemSettings.key` is not globally unique and `ownerId` is nullable, so we avoid
    // Prisma `upsert` and instead update by `id` when present.
    const setting = await prisma.$transaction(async (tx) => {
      const existing = await tx.systemSettings.findFirst({
        where: { key, ownerId: null },
        orderBy: { updatedAt: "desc" },
      })

      if (existing) {
        const updated = await tx.systemSettings.update({
          where: { id: existing.id },
          data: {
            value: String(value),
            description,
            category: category || "GENERAL",
            isActive: isActive !== undefined ? isActive : true,
            updatedAt: new Date(),
          },
        })

        // Soft-disable accidental duplicates for the same global key.
        await tx.systemSettings.updateMany({
          where: { key, ownerId: null, id: { not: existing.id } },
          data: { isActive: false, updatedAt: new Date() },
        })

        return updated
      }

      return tx.systemSettings.create({
        data: {
          key,
          value: String(value),
          description,
          category: category || "GENERAL",
          isActive: isActive !== undefined ? isActive : true,
        },
      })
    })

      if (key === "kyc_enforcement_enabled") {
        invalidateKycEnforcementCache()
      }

      if (key === "market_force_closed") {
        invalidateMarketForceClosedCache()
      }

      if (key === "market_holidays_csv") {
        invalidateNseHolidaysCache()
      }

      if (key === ADMIN_SETTING_KEYS.ORDER_CHARGES_CONFIG_V1) {
        invalidateOrderChargesConfigCache()
      }

      ctx.logger.info({ key: setting.key }, "POST /api/admin/settings - success")

    return NextResponse.json({
      success: true,
      setting,
      message: "Setting saved successfully"
    }, { status: 200 })
    }
  )
}

/**
 * DELETE - Delete setting
 */
export async function DELETE(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/settings",
      required: "admin.settings.manage",
      fallbackMessage: "Failed to delete setting",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const key = searchParams.get("key")

      if (!key) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Key is required", statusCode: 400 })
      }

    // Delete setting (global only for now). `key` is not unique, so scope delete to ownerId = null.
    await prisma.systemSettings.deleteMany({
      where: { key, ownerId: null }
    })

      ctx.logger.info({ key }, "DELETE /api/admin/settings - success")

    return NextResponse.json({
      success: true,
      message: "Setting deleted successfully"
    }, { status: 200 })
    }
  )
}