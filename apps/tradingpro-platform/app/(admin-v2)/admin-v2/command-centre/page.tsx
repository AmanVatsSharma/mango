/**
 * @file app/(admin-v2)/admin-v2/command-centre/page.tsx
 * @module admin-v2
 * @description Trade Command Centre v2 route. Auth + allowlist gating in the parent layout;
 *              admin.positions.read enforced server-side by /api/admin/trades*.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { CommandCentreV2 } from "@/components/admin-v2/command-centre"

export const dynamic = "force-dynamic"

export default function AdminV2CommandCentreRoute() {
  return <CommandCentreV2 />
}
