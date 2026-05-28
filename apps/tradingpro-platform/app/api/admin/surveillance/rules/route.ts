/**
 * File:        app/api/admin/surveillance/rules/route.ts
 * Module:      Admin · Surveillance · Rules registry (Phase 13b)
 * Purpose:     GET (read-only, ADMIN+) — list all surveillance rules + their tuning state.
 *              PATCH (SUPER_ADMIN only) — toggle active or update params/severity/baseConfidence
 *              for a single rule.
 *
 * Exports:
 *   - GET   — { rules: [...] }
 *   - PATCH — body: { ruleKey, isActive?, severity?, baseConfidence?, params?, name?, description? }
 *
 * Depends on:
 *   - @/lib/rbac/admin-api — RBAC + audit + logger.
 *   - @/lib/prisma — direct read/write of SurveillanceRule.
 *
 * Side-effects:
 *   - PATCH writes to SurveillanceRule. Operator-tuned values are sacred — past alerts already
 *     snapshot their `params` into evidence at fire-time, so retuning never rewrites history.
 *
 * Key invariants:
 *   - GET → `admin.surveillance.read`.
 *   - PATCH → `admin.surveillance.rules` (RESTRICTED to SUPER_ADMIN).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma, SurveillanceSeverity } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/surveillance/rules",
      required: "admin.surveillance.read",
      fallbackMessage: "Failed to fetch surveillance rules",
    },
    async () => {
      const rules = await prisma.surveillanceRule.findMany({
        orderBy: { ruleKey: "asc" },
        select: {
          id: true,
          ruleKey: true,
          name: true,
          description: true,
          severity: true,
          baseConfidence: true,
          isActive: true,
          params: true,
          updatedAt: true,
        },
      })
      return NextResponse.json({ success: true, rules }, { status: 200 })
    },
  )
}

const PatchSchema = z.object({
  ruleKey: z.string().min(1).max(64),
  isActive: z.boolean().optional(),
  severity: z.nativeEnum(SurveillanceSeverity).optional(),
  baseConfidence: z.number().int().min(0).max(100).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
})

export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/surveillance/rules",
      required: "admin.surveillance.rules",
      fallbackMessage: "Failed to update surveillance rule",
    },
    async ({ session, logger }) => {
      const adminId = session.user.id ?? null
      const json = await req.json().catch(() => ({}))
      const parsed = PatchSchema.safeParse(json)
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid rule update", issues: parsed.error.issues },
          { status: 400 },
        )
      }
      const { ruleKey, ...patch } = parsed.data
      const existing = await prisma.surveillanceRule.findUnique({
        where: { ruleKey },
        select: { id: true },
      })
      if (!existing) {
        return NextResponse.json(
          { success: false, error: `Rule ${ruleKey} not found` },
          { status: 404 },
        )
      }
      const updated = await prisma.surveillanceRule.update({
        where: { id: existing.id },
        data: {
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.severity ? { severity: patch.severity } : {}),
          ...(patch.baseConfidence !== undefined
            ? { baseConfidence: patch.baseConfidence }
            : {}),
          ...(patch.params ? { params: patch.params as Prisma.InputJsonValue } : {}),
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(adminId ? { updatedById: adminId } : {}),
        },
      })
      logger.info(
        { ruleKey, fields: Object.keys(patch) },
        "surveillance rule updated",
      )
      return NextResponse.json({ success: true, rule: updated }, { status: 200 })
    },
  )
}
