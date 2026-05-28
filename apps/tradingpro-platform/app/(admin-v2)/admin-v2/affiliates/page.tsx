/**
 * @file app/(admin-v2)/admin-v2/affiliates/page.tsx
 * @module admin-v2
 * @description Affiliate / IB program route — Roster / Commissions / Payouts / Attribution.
 *              Permission gating happens server-side on each API endpoint.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import { AffiliatesWorkbench } from "@/components/admin-v2/affiliates"

export default function AdminV2AffiliatesRoute() {
  return <AffiliatesWorkbench />
}
