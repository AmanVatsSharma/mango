/**
 * @file app/(admin-v2)/admin-v2/comms/page.tsx
 * @module admin-v2
 * @description Communications engine route — Templates / Campaigns / Messages / Consent.
 *              All sends go through lib/comms/send-router with three hard gates (DLT,
 *              consent, variable resolution). Permission gating happens server-side on
 *              each API endpoint.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import { CommsWorkbench } from "@/components/admin-v2/comms"

export default function AdminV2CommsRoute() {
  return <CommsWorkbench />
}
