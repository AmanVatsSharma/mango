/**
 * @file app/(admin-v2)/admin-v2/funds/withdrawals/page.tsx
 * @module admin-v2
 * @description Phase 13a — Risk-aware Withdrawal Review workbench. Renders the
 *              `<WithdrawalsWorkbench />` shell composed of the queue + risk-rules tabs.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { WithdrawalsWorkbench } from "@/components/admin-v2/withdrawals/withdrawals-workbench"

export default function AdminV2WithdrawalsRoute() {
  return <WithdrawalsWorkbench />
}
