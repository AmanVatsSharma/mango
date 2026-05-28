/**
 * @file page.tsx
 * @module admin-console/advanced
 * @description Trades command center — the master-detail workspace where admins monitor, manage, and
 *              analyze every client's trades. Replaces the flat transaction ledger (now at /admin-console/ledger).
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-15 — overhaul: TradeManagement moved to /admin-console/ledger; page now renders TradesBlotter.
 */

import { TradesBlotter } from "@/components/admin-console/trades-blotter"

export default function AdvancedPage() {
  return <TradesBlotter />
}
