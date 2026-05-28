/**
 * File:        components/admin-console/admin-page-skeleton.tsx
 * Module:      Admin Console · Loading skeleton
 * Purpose:     Shared placeholder shown while a heavy admin route's main client
 *              component (recharts-heavy analytics, system-health, financial-reports)
 *              downloads after page-level next/dynamic split.
 *
 * Exports:
 *   - AdminPageSkeleton — pure presentational, no props
 *
 * Depends on: none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Server-renderable (no "use client") so it can be the SSR shell while the
 *     chart-heavy chunk hydrates.
 *
 * Read order:
 *   1. AdminPageSkeleton — sole export
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

export function AdminPageSkeleton() {
  return (
    <div className="space-y-4 px-1 pt-2">
      <div className="h-8 w-1/3 rounded-lg bg-muted/40 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
      </div>
      <div className="h-72 rounded-xl bg-muted/40 animate-pulse" />
      <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />
    </div>
  )
}
