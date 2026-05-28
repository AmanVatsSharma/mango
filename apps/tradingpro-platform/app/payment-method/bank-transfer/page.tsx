/**
 * @file app/payment-method/bank-transfer/page.tsx
 * @module app/payment-method
 * @description Public payment method placeholder for Bank Transfer.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"

export default function BankTransferPage(): React.JSX.Element {
  return (
    <MarketingPageShell title="Bank Transfer">
      <p className="text-sm text-slate-700">Bank transfer instructions will be published here.</p>
    </MarketingPageShell>
  )
}
