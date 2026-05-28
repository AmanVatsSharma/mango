/**
 * @file app/payment-method/cash-payment/page.tsx
 * @module app/payment-method
 * @description Public payment method placeholder for Cash Payment.
 * @author StockTrade
 * @created 2026-02-19
 */

import React from "react"
import { MarketingPageShell } from "@/components/marketing/stocktrade-home/stocktrade-page-shell"

export default function CashPaymentPage(): React.JSX.Element {
  return (
    <MarketingPageShell title="Cash Payment">
      <p className="text-sm text-slate-700">Cash payment instructions will be published here.</p>
    </MarketingPageShell>
  )
}
