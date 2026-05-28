/**
 * @file app/(console)/console/error.tsx
 * @module app/(console)/console
 * @description Next.js App Router segment error boundary for the console route.
 *   ChunkLoadErrors trigger silent auto-recovery. Other errors show a recovery card
 *   consistent with the console's visual style.
 * @author StockTrade
 * @created 2026-04-12
 */

"use client"

import { useEffect, useState } from "react"
import { ChunkLoadErrorHandler } from "@/components/chunk-load-error-handler"
import {
  isChunkLoadError,
  prepareChunkLoadRecovery,
} from "@/lib/navigation/chunk-load-recovery"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { getAppRoute } from "@/lib/branding-routes"

interface ConsoleErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ConsoleError({ error, reset }: ConsoleErrorProps) {
  const [chunkReloading, setChunkReloading] = useState(false)
  const [chunkGiveUp, setChunkGiveUp] = useState(false)

  useEffect(() => {
    if (!isChunkLoadError(error)) return
    const outcome = prepareChunkLoadRecovery()
    if (outcome === "reload") {
      setChunkReloading(true)
    } else {
      setChunkGiveUp(true)
    }
  }, [error])

  if (chunkReloading) {
    return <ChunkLoadErrorHandler giveUp={false} />
  }

  if (chunkGiveUp) {
    return <ChunkLoadErrorHandler giveUp={true} />
  }

  return (
    <div className="flex items-center justify-center min-h-[100dvh] p-4 bg-background">
      <div className="w-full max-w-lg">
        <Card className="border-destructive">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">Something went wrong</CardTitle>
            <CardDescription>
              We encountered an error while loading your console. Your data is safe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {process.env.NODE_ENV === "development" && error?.message && (
              <div className="p-3 bg-muted rounded-md">
                <p className="font-mono text-xs break-all">{error.message}</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button onClick={reset} className="w-full" variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button
                onClick={() => { window.location.href = getAppRoute("dashboard") }}
                variant="outline"
                className="w-full"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              If this problem persists, please contact support
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
