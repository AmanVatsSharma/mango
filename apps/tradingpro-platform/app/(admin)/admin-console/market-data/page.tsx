/**
 * File:        app/(admin)/admin-console/market-data/page.tsx
 * Module:      admin-console · Market Data
 * Purpose:     Route entry point for the dedicated Market Data admin page.
 *
 * Exports:
 *   - MarketDataPage (default) — Next.js page component
 *
 * Depends on:
 *   - MarketDataAdminPage — full page implementation
 *
 * Side-effects: none
 * Key invariants: none
 *
 * Read order:
 *   1. MarketDataAdminPage — all logic lives there
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-25
 */

import { MarketDataAdminPage } from "@/components/admin-console/market-data/MarketDataAdminPage"

export default function MarketDataPage() {
  return <MarketDataAdminPage />
}
