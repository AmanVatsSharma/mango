/**
 * @file app/payment-method/upi-transfer/page.tsx
 * @module app/payment-method
 * @description Public payment method placeholder for UPI Transfer.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"

export default function UpiTransferPage(): React.JSX.Element {
  return (
    <MarketingPageShell title="UPI Transfer">
      <p className="text-sm text-slate-700">UPI transfer instructions will be published here.</p>
    </MarketingPageShell>
  )
}
