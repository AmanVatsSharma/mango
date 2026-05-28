/**
 * @file app/(admin-v2)/admin-v2/house/page.tsx
 * @module admin-v2
 * @description House Book Dashboard route — broker counterparty exposure + P&L hero.
 *              The single most important screen for the broker's day. Mounted under the
 *              v2 shell; gated server-side by admin.house.read on every API call.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import { HouseDashboard } from "@/components/admin-v2/house"

export default function AdminV2HouseRoute() {
  return <HouseDashboard />
}
