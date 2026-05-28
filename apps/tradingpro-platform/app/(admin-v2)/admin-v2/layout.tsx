/**
 * @file app/(admin-v2)/admin-v2/layout.tsx
 * @module admin-v2
 * @description Server-component layout for the v2 admin shell. Gates access by:
 *                1. NextAuth session present.
 *                2. The session's userId being in the ADMIN_V2_ALLOWLIST env-var.
 *              Anyone failing either check is redirected to /admin-console (v1) so day-to-day
 *              ops continues uninterrupted. Reuses AdminSessionProvider so RBAC + permissions
 *              behave identically across v1 and v2.
 *
 *              Exports:
 *                - default AdminV2Layout — wraps children in V2Shell + AdminSessionProvider.
 *
 *              Side-effects: redirect() on auth/allowlist failure.
 *
 *              Key invariants:
 *                - Allowlist is checked server-side. Bypassing the env-var requires server access.
 *                - Layout is a server component; the interactive shell + shortcuts live in V2Shell (client).
 *
 *              Read order:
 *                1. auth() / allowlist guard.
 *                2. AdminSessionProvider wrapping V2Shell.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ADMIN_V2_DENIED_REDIRECT, isAdminV2Allowed } from "@/lib/admin-v2/auth-gate"
import { AdminSessionProvider } from "@/components/admin-console/admin-session-provider"
import { V2Shell } from "@/components/admin-v2/shell/v2-shell"
import "@/components/admin-v2/admin-v2.css"

export const dynamic = "force-dynamic"

export default async function AdminV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/admin-v2")
  }

  if (!isAdminV2Allowed(session.user.id)) {
    redirect(ADMIN_V2_DENIED_REDIRECT)
  }

  return (
    <AdminSessionProvider>
      <V2Shell>{children}</V2Shell>
    </AdminSessionProvider>
  )
}
