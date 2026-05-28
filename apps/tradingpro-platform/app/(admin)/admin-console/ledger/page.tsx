/**
 * @file page.tsx
 * @module admin-console/ledger
 * @description Transaction Ledger — preserved flat view of money movements (credits/debits, deposits,
 *              withdrawals, realized P&L transactions). Previously mounted at /admin-console/advanced,
 *              now lives here while /advanced hosts the new TradesBlotter workspace.
 * @author StockTrade
 * @created 2026-04-15
 */

import { TradeManagement } from "@/components/admin-console/trade-management"

export default function LedgerPage() {
  return <TradeManagement />
}
