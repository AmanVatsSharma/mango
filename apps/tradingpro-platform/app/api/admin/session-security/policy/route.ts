/**
 * @file route.ts
 * @module admin-api/session-security
 * @description Read and update SESSION_SECURITY_POLICY_V1 (SystemSettings JSON).
 * @author StockTrade
 * @created 2026-03-28
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { ADMIN_SETTING_KEYS, ADMIN_SETTING_CATEGORIES } from "@/lib/constants/admin-settings"
import {
  DEFAULT_SESSION_SECURITY_POLICY_V1,
  mergeSessionSecurityPolicy,
} from "@/lib/session-security/session-security-policy"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/policy",
      required: "admin.session-security.read",
      fallbackMessage: "Failed to load policy",
    },
    async () => {
      const row = await prisma.systemSettings.findFirst({
        where: { key: ADMIN_SETTING_KEYS.SESSION_SECURITY_POLICY_V1, ownerId: null },
      })
      let policy = { ...DEFAULT_SESSION_SECURITY_POLICY_V1 }
      if (row?.value) {
        try {
          policy = mergeSessionSecurityPolicy(JSON.parse(row.value))
        } catch {
          policy = { ...DEFAULT_SESSION_SECURITY_POLICY_V1 }
        }
      }
      return NextResponse.json({ success: true, data: { policy, rawUpdatedAt: row?.updatedAt ?? null } })
    },
  )
}

export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/session-security/policy",
      required: "admin.session-security.manage",
      fallbackMessage: "Failed to save policy",
    },
    async () => {
      const raw = await req.json().catch(() => null)
      const incoming = raw && typeof raw === "object" && "policy" in raw ? (raw as { policy: unknown }).policy : raw
      if (!isRecord(incoming)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Expected JSON body with policy object",
          statusCode: 400,
        })
      }
      const merged = mergeSessionSecurityPolicy({ ...incoming, version: 1 })
      const value = JSON.stringify(merged)

      const saved = await prisma.$transaction(async (tx) => {
        const existing = await tx.systemSettings.findFirst({
          where: { key: ADMIN_SETTING_KEYS.SESSION_SECURITY_POLICY_V1, ownerId: null },
          orderBy: { updatedAt: "desc" },
        })
        if (existing) {
          await tx.systemSettings.updateMany({
            where: { key: ADMIN_SETTING_KEYS.SESSION_SECURITY_POLICY_V1, ownerId: null, id: { not: existing.id } },
            data: { isActive: false, updatedAt: new Date() },
          })
          return tx.systemSettings.update({
            where: { id: existing.id },
            data: {
              value,
              category: ADMIN_SETTING_CATEGORIES.SECURITY,
              description: "Session security & device policy (v1)",
              updatedAt: new Date(),
            },
          })
        }
        return tx.systemSettings.create({
          data: {
            key: ADMIN_SETTING_KEYS.SESSION_SECURITY_POLICY_V1,
            value,
            category: ADMIN_SETTING_CATEGORIES.SECURITY,
            description: "Session security & device policy (v1)",
          },
        })
      })

      return NextResponse.json({ success: true, data: { policy: merged, updatedAt: saved.updatedAt } })
    },
  )
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
