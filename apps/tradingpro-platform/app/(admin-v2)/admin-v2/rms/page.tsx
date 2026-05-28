/**
 * @file app/(admin-v2)/admin-v2/rms/page.tsx
 * @module admin-v2
 * @description RM & Teams workbench route. Auth + allowlist gating in the parent layout;
 *              admin.users.rm permission enforced on every API call.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { RmWorkbench } from "@/components/admin-v2/rm"

export const dynamic = "force-dynamic"

export default function AdminV2RmsRoute() {
  return <RmWorkbench />
}
