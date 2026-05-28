/**
 * @file components/admin-v2/home/use-role-resolution.ts
 * @module admin-v2/home
 * @description Resolves which home variant to render given the AdminSession user + permissions.
 *
 *              Exports:
 *                - HomeVariant — the union of variant keys.
 *                - useHomeVariant() — hook returning the resolved variant for the current session.
 *
 *              Resolution priority (first match wins):
 *                1. role === "SUPER_ADMIN"        → "super-admin"
 *                2. role === "MODERATOR"          → "rm"               (scoped to their book)
 *                3. has admin.positions.read OR admin.house.read → "ops"
 *                4. has admin.users.kyc           → "compliance"
 *                5. fallback                      → "super-admin"      (full surface, always works)
 *
 *              The user can override their detected variant via ?as=compliance|rm|ops|super-admin
 *              (useful for SUPER_ADMIN to dogfood other personas without juggling accounts).
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import { useSearchParams } from "next/navigation"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"

export type HomeVariant = "compliance" | "rm" | "ops" | "super-admin"

const VALID: ReadonlySet<HomeVariant> = new Set<HomeVariant>([
  "compliance",
  "rm",
  "ops",
  "super-admin",
])

export function useHomeVariant(): HomeVariant {
  const session = useAdminSession()
  const searchParams = useSearchParams()
  const override = searchParams.get("as") as HomeVariant | null
  if (override && VALID.has(override)) return override

  const role = session.user?.role
  const perms = session.permissions

  if (role === "SUPER_ADMIN") return "super-admin"
  if (role === "MODERATOR") return "rm"
  if (perms.includes("admin.positions.read") || perms.includes("admin.house.read")) return "ops"
  if (perms.includes("admin.users.kyc")) return "compliance"
  return "super-admin"
}
