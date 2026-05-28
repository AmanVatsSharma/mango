/**
 * @file components/admin-v2/home/role-aware-home.tsx
 * @module admin-v2/home
 * @description The default landing page for /admin-v2. Picks the variant based on the
 *              authenticated user's role + permissions (see use-role-resolution.ts).
 *
 *              Exports: default RoleAwareHome.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import ComplianceHome from "./compliance-home"
import OpsHome from "./ops-home"
import RmHome from "./rm-home"
import SuperAdminHome from "./super-admin-home"
import { useHomeVariant } from "./use-role-resolution"

export default function RoleAwareHome() {
  const variant = useHomeVariant()
  switch (variant) {
    case "compliance":
      return <ComplianceHome />
    case "rm":
      return <RmHome />
    case "ops":
      return <OpsHome />
    case "super-admin":
    default:
      return <SuperAdminHome />
  }
}
