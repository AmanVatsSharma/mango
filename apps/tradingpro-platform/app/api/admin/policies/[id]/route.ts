/**
 * @file route.ts
 * @module admin-console
 * @description GET/PATCH/DELETE /api/admin/policies/[id]
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { PolicyRepository } from "@/lib/repositories/PolicyRepository"

export const dynamic = "force-dynamic"

function parseOptionalDecimal(val: unknown): string | null | undefined {
  if (val === null) return null
  if (val === undefined || val === "") return undefined
  const n = Number(val)
  return Number.isFinite(n) && n >= 0 ? String(n) : undefined
}

function parseOptionalInt(val: unknown): number | null | undefined {
  if (val === null) return null
  if (val === undefined || val === "") return undefined
  const n = Math.trunc(Number(val))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/policies/[id]", required: "admin.policies.read", fallbackMessage: "Failed to fetch policy" },
    async () => {
      const policy = await PolicyRepository.findById(params.id)
      if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 })
      return NextResponse.json({ policy })
    }
  )
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/policies/[id]", required: "admin.policies.manage", fallbackMessage: "Failed to update policy" },
    async () => {
      const body = await req.json()
      const { name, description, isActive, leverage, brokerageFlat, brokerageRate, maxDailyLoss, maxDailyTrades, maxPositions, maxOrderValue, allowedSegments } = body

      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = name.trim()
      if (description !== undefined) data.description = description?.trim() || null
      if (isActive !== undefined) data.isActive = isActive
      if (leverage !== undefined) data.leverage = parseOptionalDecimal(leverage)
      if (brokerageFlat !== undefined) data.brokerageFlat = parseOptionalDecimal(brokerageFlat)
      if (brokerageRate !== undefined) data.brokerageRate = parseOptionalDecimal(brokerageRate)
      if (maxDailyLoss !== undefined) data.maxDailyLoss = parseOptionalDecimal(maxDailyLoss)
      if (maxDailyTrades !== undefined) data.maxDailyTrades = parseOptionalInt(maxDailyTrades)
      if (maxPositions !== undefined) data.maxPositions = parseOptionalInt(maxPositions)
      if (maxOrderValue !== undefined) data.maxOrderValue = parseOptionalDecimal(maxOrderValue)
      if (allowedSegments !== undefined) data.allowedSegments = Array.isArray(allowedSegments) ? allowedSegments : []

      const policy = await PolicyRepository.update(params.id, data)
      return NextResponse.json({ policy })
    }
  )
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/policies/[id]", required: "admin.policies.manage", fallbackMessage: "Failed to delete policy" },
    async () => {
      await PolicyRepository.delete(params.id)
      return NextResponse.json({ success: true })
    }
  )
}
