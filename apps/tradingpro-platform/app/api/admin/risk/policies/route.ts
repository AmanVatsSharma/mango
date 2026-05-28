/**
 * @file route.ts
 * @module admin-console
 * @description Admin API route for dynamic trading policy CRUD and runtime policy catalog exposure.
 * @author StockTrade
 * @created 2026-02-17
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  createTradingPolicy,
  deleteTradingPolicy,
  getTradingPolicyCatalog,
  listTradingPolicies,
  updateTradingPolicy,
} from "@/lib/services/risk/dynamic-trading-policies"
import {
  getTradingPolicies as getLegacyTradingPolicies,
  upsertTradingPolicies as upsertLegacyTradingPolicies,
} from "@/lib/services/risk/trading-policies"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/policies",
      required: "admin.risk.read",
      fallbackMessage: "Failed to fetch trading policies",
    },
    async (ctx) => {
      const policies = await listTradingPolicies({ maxAgeMs: 0, includeLegacy: true })
      const catalog = getTradingPolicyCatalog()
      ctx.logger.info(
        {
          policyCount: policies.length,
          legacyPolicies: policies.filter((policy) => policy.source === "legacy").length,
        },
        "GET /api/admin/risk/policies - success",
      )
      return NextResponse.json({ success: true, policies, catalog }, { status: 200 })
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/policies",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to create trading policy",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const policy = await createTradingPolicy(body)

      ctx.logger.info(
        {
          policyId: policy.id,
          context: policy.context,
          enabled: policy.enabled,
        },
        "POST /api/admin/risk/policies - success",
      )

      return NextResponse.json({ success: true, policy }, { status: 201 })
    },
  )
}

export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/policies",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to update trading policy",
    },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const hasLegacyEnabled = Object.prototype.hasOwnProperty.call(body, "negativePnlCloseDelayEnabled")
      const hasLegacyMinutes = Object.prototype.hasOwnProperty.call(body, "negativePnlCloseDelayMinutes")

      if (hasLegacyEnabled || hasLegacyMinutes) {
        const currentLegacyPolicies = await getLegacyTradingPolicies({ maxAgeMs: 0 })
        const nextEnabled = hasLegacyEnabled
          ? (body as any).negativePnlCloseDelayEnabled
          : currentLegacyPolicies.negativePnlCloseDelayEnabled
        const nextMinutes = hasLegacyMinutes
          ? (body as any).negativePnlCloseDelayMinutes
          : currentLegacyPolicies.negativePnlCloseDelayMinutes
        const legacyPolicy = await upsertLegacyTradingPolicies({
          negativePnlCloseDelayEnabled: nextEnabled,
          negativePnlCloseDelayMinutes: nextMinutes,
        })
        const policies = await listTradingPolicies({ maxAgeMs: 0, includeLegacy: true })
        ctx.logger.info(
          {
            legacyPolicyUpdated: true,
            negativePnlCloseDelayEnabled: legacyPolicy.negativePnlCloseDelayEnabled,
            negativePnlCloseDelayMinutes: legacyPolicy.negativePnlCloseDelayMinutes,
          },
          "PUT /api/admin/risk/policies - legacy payload updated",
        )
        return NextResponse.json(
          {
            success: true,
            message: "Legacy policy keys updated",
            policies,
            legacyPolicy,
          },
          { status: 200 },
        )
      }

      const policy = await updateTradingPolicy(body)
      ctx.logger.info(
        { policyId: policy.id, context: policy.context, enabled: policy.enabled },
        "PUT /api/admin/risk/policies - success",
      )
      return NextResponse.json({ success: true, policy }, { status: 200 })
    },
  )
}

export async function DELETE(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/risk/policies",
      required: "admin.risk.manage",
      fallbackMessage: "Failed to delete trading policy",
    },
    async (ctx) => {
      const url = new URL(req.url)
      const idFromQuery = url.searchParams.get("id")
      let idFromBody: unknown = null
      if (!idFromQuery) {
        const body = await req.json().catch(() => null)
        if (body && typeof body === "object" && !Array.isArray(body)) {
          idFromBody = (body as any).id
        }
      }
      const policyId = idFromQuery || (typeof idFromBody === "string" ? idFromBody : null)
      if (!policyId) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Policy id is required",
          statusCode: 400,
        })
      }
      const deletedPolicy = await deleteTradingPolicy(policyId)
      ctx.logger.info({ policyId: deletedPolicy.id }, "DELETE /api/admin/risk/policies - success")
      return NextResponse.json({ success: true, deletedPolicy }, { status: 200 })
    },
  )
}
