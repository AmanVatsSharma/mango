/**
 * @file trading-dashboard-online-dot.tsx
 * @module admin-console/shared
 * @description Green presence indicator: user has an active trading dashboard SSE session.
 * @author StockTrade
 * @created 2026-04-03
 */

export function TradingDashboardOnlineDot() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.85)] ring-2 ring-green-500/35"
      aria-label="Trading dashboard online"
      title="On trading dashboard (live SSE connection)"
    />
  )
}
