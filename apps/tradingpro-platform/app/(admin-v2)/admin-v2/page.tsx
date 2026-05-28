/**
 * @file app/(admin-v2)/admin-v2/page.tsx
 * @module admin-v2
 * @description v2 admin home — role-aware. Renders one of four variants (Compliance / RM / Ops /
 *              Super Admin) based on the AdminSession. Override via ?as=compliance|rm|ops|super-admin
 *              for super-admins to dogfood other personas.
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 7: now renders the role-aware home (not the Phase 4 placeholder).
 */

"use client"

import { RoleAwareHome } from "@/components/admin-v2/home"

export default function AdminV2HomeRoute() {
  return <RoleAwareHome />
}
