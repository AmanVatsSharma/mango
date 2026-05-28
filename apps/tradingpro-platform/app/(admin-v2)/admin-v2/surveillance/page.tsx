/**
 * @file app/(admin-v2)/admin-v2/surveillance/page.tsx
 * @module admin-v2
 * @description Phase 13b — Internal Surveillance workbench entry. Server component;
 *              resolves the role to gate rule-editing capability for the client shell.
 *
 *              Exports:
 *                - default — async server component, returns <SurveillanceWorkbench />.
 *
 *              Side-effects: auth() session read.
 *
 *              Key invariants:
 *                - Read access is allowlist-gated by the parent layout. SUPER_ADMIN-only
 *                  rule editing is enforced server-side; the prop here is for UI affordance
 *                  (greying-out controls). Server APIs re-check the permission.
 *
 * @author StockTrade
 * @created 2026-04-30
 */

import { auth } from "@/auth"
import { SurveillanceWorkbench } from "@/components/admin-v2/surveillance/surveillance-workbench"

export const dynamic = "force-dynamic"

export default async function AdminV2SurveillanceRoute() {
  const session = await auth()
  // The User type in next-auth doesn't surface `role`; the session callback augments the
  // token with it. Pull off via a narrow cast to keep page rendering side-effect-free.
  const role = (session?.user as { role?: string } | null | undefined)?.role ?? null
  const canEditRules = role === "SUPER_ADMIN"

  return <SurveillanceWorkbench canEditRules={canEditRules} />
}
