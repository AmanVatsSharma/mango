/**
 * @file app/(admin)/admin-console/error.tsx
 * @module app/(admin)/admin-console
 * @description Next.js App Router segment error boundary for the admin console.
 *   ChunkLoadErrors trigger silent auto-recovery. Other errors show an admin
 *   recovery card with both a "Retry" (subtree reset) and "Full Reload" option.
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
import { AlertTriangle, RefreshCw } from "lucide-react"

interface AdminConsoleErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminConsoleError({ error, reset }: AdminConsoleErrorProps) {
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
      <Card className="w-full max-w-md border-destructive">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <CardTitle>Admin Console Error</CardTitle>
          <CardDescription>
            An error occurred in the admin console. Please retry or reload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {process.env.NODE_ENV === "development" && error?.message && (
            <div className="p-3 bg-muted rounded-md">
              <p className="font-mono text-xs break-all">{error.message}</p>
            </div>
          )}
          <Button onClick={reset} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.location.reload()}
          >
            Full Reload
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
