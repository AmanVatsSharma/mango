/**
 * @file chunk-load-error-handler.tsx
 * @module components
 * @description Client component shown during ChunkLoadError auto-recovery.
 *   When giveUp=false: shows "App update detected. Refreshing..." and auto-reloads in 800ms.
 *   When giveUp=true: shows "App Update Required" card with a manual reload button.
 * @author StockTrade
 * @created 2026-04-12
 */

"use client"

import { useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clearChunkLoadRecoveryCounter } from "@/lib/navigation/chunk-load-recovery"

interface ChunkLoadErrorHandlerProps {
  /** When true, max retries have been exhausted — show manual reload card. */
  giveUp: boolean
}

export function ChunkLoadErrorHandler({ giveUp }: ChunkLoadErrorHandlerProps) {
  useEffect(() => {
    if (giveUp) return
    // Auto-reload after a short delay so the "Refreshing..." message is visible
    const timer = window.setTimeout(() => {
      window.location.reload()
    }, 800)
    return () => window.clearTimeout(timer)
  }, [giveUp])

  if (giveUp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/85 p-8 text-center shadow-sm backdrop-blur-md space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10">
            <RefreshCw className="h-7 w-7 text-blue-600" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">App Update Required</p>
            <p className="text-sm text-muted-foreground">
              A new version of the app was deployed. Auto-refresh could not complete. Please reload manually to get the latest version.
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              clearChunkLoadRecoveryCounter()
              window.location.reload()
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reload App
          </Button>
        </div>
      </div>
    )
  }

  // Auto-reload path: show brief overlay while reload is triggered
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/85 p-6 text-center shadow-sm backdrop-blur-md space-y-3">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
        <p className="font-medium text-foreground">App update detected. Refreshing...</p>
        <p className="text-xs text-muted-foreground">This only takes a moment.</p>
      </div>
    </div>
  )
}
