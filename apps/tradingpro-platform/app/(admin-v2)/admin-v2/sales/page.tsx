/**
 * @file app/(admin-v2)/admin-v2/sales/page.tsx
 * @module admin-v2
 * @description Sales workbench route — currently the standalone Callback Radar surface.
 *              Phase 7 promotes Callback Radar to a tile on the role-aware home for the RM
 *              persona; this page remains the deep-link destination.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import CallbackRadar from "@/components/admin-v2/crm/callback-radar"

export const dynamic = "force-dynamic"

export default function AdminV2SalesRoute() {
  return <CallbackRadar />
}
