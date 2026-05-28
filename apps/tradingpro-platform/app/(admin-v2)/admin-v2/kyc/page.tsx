/**
 * @file app/(admin-v2)/admin-v2/kyc/page.tsx
 * @module admin-v2
 * @description Compliance Workbench route shell. Auth + allowlist gating handled by the parent
 *              layout. Admin permission `admin.users.kyc` enforced on every API call the
 *              workbench makes.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import ComplianceWorkbench from "@/components/admin-v2/compliance/compliance-workbench"

export const dynamic = "force-dynamic"

export default function AdminV2KycRoute() {
  return <ComplianceWorkbench />
}
