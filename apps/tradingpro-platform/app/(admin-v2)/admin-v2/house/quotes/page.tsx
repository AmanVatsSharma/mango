/**
 * File:        app/(admin-v2)/admin-v2/house/quotes/page.tsx
 * Module:      admin-v2 · House · Quotes route
 * Purpose:     Mount the SpreadWorkbench under a prominent "not yet integrated"
 *              banner. The admin-v2 spread engine (lib/spread/spread-engine.ts +
 *              Prisma SpreadConfig table) is intentionally orphaned today: no caller
 *              in market-data, order-execution, watchlist, or order-form imports
 *              from @/lib/spread/*. Edits made here do NOT change the spread that
 *              clients see or that orders fill at — those flow through the canonical
 *              MarketControlConfigV1 path edited under Admin Console → Market Data.
 *
 * Exports:
 *   - default function AdminV2HouseQuotesRoute  — Next.js page component
 *
 * Depends on:
 *   - @/components/admin-v2/spread (SpreadWorkbench) — the live (but orphaned) UI
 *
 * Side-effects: none (renders).
 *
 * Key invariants:
 *   - Banner copy must remain explicit until the engine is wired into runtime
 *     resolution (lib/market-control/market-control-resolver.ts). When that
 *     integration lands, remove this banner in the same change.
 *
 * Read order:
 *   1. AdminV2HouseQuotesRoute — page component
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-29
 */

"use client"

import { AlertTriangle } from "lucide-react"
import { SpreadWorkbench } from "@/components/admin-v2/spread"

export default function AdminV2HouseQuotesRoute() {
  return (
    <>
      <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8">
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-100"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-400" aria-hidden="true" />
            <div className="space-y-1 text-sm leading-relaxed">
              <p className="font-semibold uppercase tracking-wide text-amber-200">
                Not yet integrated — preview only
              </p>
              <p>
                This panel is part of the admin-v2 redesign. Spread changes saved here are
                stored in the new <code className="font-mono">SpreadConfig</code> table but
                are <strong>not yet read by the quote pipeline, order execution, or any
                client</strong>. Edits will <strong>not</strong> change what users see in the
                watchlist, the order dialog, or the price they fill at.
              </p>
              <p>
                For live spread changes, use{" "}
                <strong>Admin Console → Market Data → Segments → Spread %</strong>.
                Those edits propagate to all connected clients within ~1 second.
              </p>
            </div>
          </div>
        </div>
      </div>
      <SpreadWorkbench />
    </>
  )
}
