/**
 * @file route.ts
 * @module admin-console
 * @description GET /api/admin/policies — list all trading policies
 *              POST /api/admin/policies — create a new trading policy
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { PolicyRepository } from "@/lib/repositories/PolicyRepository"

export const dynamic = "force-dynamic"

function parseOptionalDecimal(val: unknown): string | undefined {
  if (val === null || val === undefined || val === "") return undefined
  const n = Number(val)
  return Number.isFinite(n) && n >= 0 ? String(n) : undefined
}

function parseOptionalInt(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined
  const n = Math.trunc(Number(val))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/policies", required: "admin.policies.read", fallbackMessage: "Failed to fetch policies" },
    async () => {
      const policies = await PolicyRepository.findMany()
      return NextResponse.json({ policies })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/policies", required: "admin.policies.manage", fallbackMessage: "Failed to create policy" },
    async (ctx) => {
      const body = await req.json()
      const { name, description, leverage, brokerageFlat, brokerageRate, maxDailyLoss, maxDailyTrades, maxPositions, maxOrderValue, allowedSegments } = body

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "name is required" }, { status: 400 })
      }

      const policy = await PolicyRepository.create({
        name: name.trim(),
        description: description?.trim() || null,
        leverage: parseOptionalDecimal(leverage),
        brokerageFlat: parseOptionalDecimal(brokerageFlat),
        brokerageRate: parseOptionalDecimal(brokerageRate),
        maxDailyLoss: parseOptionalDecimal(maxDailyLoss),
        maxDailyTrades: parseOptionalInt(maxDailyTrades),
        maxPositions: parseOptionalInt(maxPositions),
        maxOrderValue: parseOptionalDecimal(maxOrderValue),
        allowedSegments: Array.isArray(allowedSegments) ? allowedSegments : [],
        createdBy: { connect: { id: ctx.session.user.id } },
      })
      return NextResponse.json({ policy }, { status: 201 })
    }
  )
}
