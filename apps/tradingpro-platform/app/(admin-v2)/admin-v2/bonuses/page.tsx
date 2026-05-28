/**
 * @file app/(admin-v2)/admin-v2/bonuses/page.tsx
 * @module admin-v2
 * @description Bonus engine route — Rules / Grants / Bulk-issue / Promo workbench.
 *              Permission gating happens server-side on each API endpoint.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import { BonusesWorkbench } from "@/components/admin-v2/bonuses"

export default function AdminV2BonusesRoute() {
  return <BonusesWorkbench />
}
