/**
 * File:        app/api/admin/withdrawals/risk-rules/route.ts
 * Module:      Admin · Funds · Withdrawals · Risk Rule Registry (Phase 13a)
 * Purpose:     CRUD endpoints for the `WithdrawalRiskRule` table — the admin-tunable rule list
 *              consumed by the engine. All seeded keys are upsert-only (re-seed safe).
 *
 * Exports:
 *   - GET    — list all rules (active first).
 *   - POST   — create a new rule (ruleKey must NOT exist).
 *   - PATCH  — update a rule by id { id, points?, params?, isActive?, name?, description? }.
 *
 * Depends on:
 *   - @/lib/rbac/admin-api — RBAC + audit + logger.
 *
 * Side-effects: DB writes on `withdrawal_risk_rules`.
 *
 * Key invariants:
 *   - GET requires `admin.withdrawals.review`. POST + PATCH require `admin.withdrawals.rules`
 *     (high-risk; super-admin only by default — see permissions.ts grant table).
 *   - Rule deletion is NOT supported by design — disable instead. `Withdrawal.holdRuleKeys`
 *     snapshots the key, and a DELETE would silently break the audit trail.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals/risk-rules",
      required: "admin.withdrawals.review",
      fallbackMessage: "Failed to fetch risk rules",
    },
    async () => {
      const rules = await prisma.withdrawalRiskRule.findMany({
        orderBy: [{ isActive: "desc" }, { ruleKey: "asc" }],
      })
      return NextResponse.json({ success: true, rules }, { status: 200 })
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals/risk-rules",
      required: "admin.withdrawals.rules",
      fallbackMessage: "Failed to create risk rule",
    },
    async ({ session, logger }) => {
      const body = (await req.json().catch(() => ({}))) as {
        ruleKey?: string
        name?: string
        description?: string
        points?: number
        params?: Record<string, unknown>
      }
      const ruleKey = (body.ruleKey ?? "").trim().toUpperCase()
      const name = (body.name ?? "").trim()
      if (!ruleKey || !/^[A-Z][A-Z0-9_]{2,63}$/.test(ruleKey)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message:
            "ruleKey must be UPPER_SNAKE_CASE, 3–64 chars, starting with a letter.",
          statusCode: 400,
        })
      }
      if (!name) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "name is required",
          statusCode: 400,
        })
      }
      const points = Number.isFinite(body.points) ? Number(body.points) : 0

      const created = await prisma.withdrawalRiskRule.create({
        data: {
          ruleKey,
          name,
          description: body.description ?? null,
          points,
          params: (body.params ?? {}) as Prisma.InputJsonValue,
          createdById: session.user.id ?? null,
        },
      })
      logger.info({ ruleKey, by: session.user.id }, "risk-rule created")
      return NextResponse.json({ success: true, rule: created }, { status: 201 })
    },
  )
}

export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals/risk-rules",
      required: "admin.withdrawals.rules",
      fallbackMessage: "Failed to update risk rule",
    },
    async ({ session, logger }) => {
      const body = (await req.json().catch(() => ({}))) as {
        id?: string
        name?: string
        description?: string | null
        points?: number
        isActive?: boolean
        params?: Record<string, unknown>
      }
      const id = typeof body.id === "string" ? body.id.trim() : ""
      if (!id) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "id is required",
          statusCode: 400,
        })
      }
      const data: Prisma.WithdrawalRiskRuleUpdateInput = {
        updatedBy: { connect: { id: session.user.id! } },
      }
      if (typeof body.name === "string") data.name = body.name.trim()
      if (typeof body.description === "string" || body.description === null) {
        data.description = body.description
      }
      if (typeof body.points === "number" && Number.isFinite(body.points)) {
        data.points = body.points
      }
      if (typeof body.isActive === "boolean") data.isActive = body.isActive
      if (body.params && typeof body.params === "object") {
        data.params = body.params as Prisma.InputJsonValue
      }

      const updated = await prisma.withdrawalRiskRule
        .update({ where: { id }, data })
        .catch(() => null)
      if (!updated) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "Rule not found",
          statusCode: 404,
        })
      }
      logger.info({ id, by: session.user.id }, "risk-rule updated")
      return NextResponse.json({ success: true, rule: updated }, { status: 200 })
    },
  )
}
