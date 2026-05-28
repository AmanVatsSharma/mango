/**
 * @file app/(admin-v2)/admin-v2/house/winners/page.tsx
 * @module admin-v2
 * @description Winner Mitigation workbench route — global flagged-winners table +
 *              click-to-open per-client control panel drawer.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import { WinnersWorkbench } from "@/components/admin-v2/winners"

export default function AdminV2HouseWinnersRoute() {
  return <WinnersWorkbench />
}
