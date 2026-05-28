/**
 * @file app/(main)/dashboard/loading.tsx
 * @module app/(main)/dashboard
 * @description Next.js App Router loading state for the dashboard segment.
 *   Shown during route transitions (when navigating to /dashboard from another route)
 *   while the page JS bundle is being fetched. Premium animated loading with
 *   skeleton cards matching the StockTrade brand aesthetic.
 * @author StockTrade
 * @created 2026-04-12
 * @updated 2026-05-11 — premium animated loading with logo + skeleton cards
 */

import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { BRAND_ASSETS } from "@/Branding"

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 p-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Brand + spinner */}
        <div className="flex flex-col items-center gap-4">
          {/* Logo mark */}
          <img
            src={BRAND_ASSETS.logos.mark}
            alt="StockTrade"
            className="w-14 h-14 rounded-2xl"
          />
          <div className="flex flex-col items-center gap-1">
            <p className="text-lg font-bold text-foreground">StockTrade</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading your trading workspace...</span>
            </div>
          </div>
        </div>

        {/* Skeleton cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden border-border/60">
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-7 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-40 bg-muted rounded animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
