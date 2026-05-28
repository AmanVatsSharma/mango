/**
 * @file app/(console)/console/loading.tsx
 * @module app/(console)/console
 * @description Next.js App Router loading state for the console segment.
 *   Shown during route transitions to /console while the page JS bundle loads.
 * @author StockTrade
 * @created 2026-04-12
 */

export default function ConsoleLoading() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh] p-4 bg-gradient-to-b from-background via-background to-muted/20">
      <div className="text-center space-y-4 w-full max-w-6xl">
        <div className="flex justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Loading your console...</h3>
          <p className="text-sm text-muted-foreground">
            Fetching your account data and trading information
          </p>
        </div>
      </div>
    </div>
  )
}
