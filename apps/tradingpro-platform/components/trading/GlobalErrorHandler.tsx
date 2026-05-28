/**
 * @file GlobalErrorHandler.tsx
 * @module trading
 * @description Global error handler wrapper component that catches ChunkLoadErrors and
 *   triggers auto-recovery. Background async errors (WebSocket, SSE, promise rejections)
 *   are logged and reported but do NOT replace the UI — React error boundaries handle
 *   component render errors; window.onerror background errors must not nuke the dashboard.
 * @author StockTrade
 * @created 2024-12-19
 */

"use client"

import React, { useState, useCallback, useEffect } from 'react'
import { useGlobalErrorHandler } from '@/hooks/use-global-error-handler'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import {
  prepareChunkLoadRecovery,
  clearChunkLoadRecoveryCounter,
} from '@/lib/navigation/chunk-load-recovery'

interface GlobalErrorHandlerProps {
  children: React.ReactNode
}

/**
 * GlobalErrorHandler Component
 *
 * Wraps the application to handle two concerns:
 * 1. ChunkLoadErrors (stale JS chunks after a deployment) — auto-reloads the page silently.
 * 2. All other window.onerror / unhandledrejection events — logged and reported only.
 *    These are background async errors (WebSocket, SSE, SWR, timers) that must NOT replace
 *    the trading UI. React error boundaries in dashboard/error.tsx handle component crashes.
 *
 * This component should be placed high in the component tree, in the root layout.
 */
export function GlobalErrorHandler({ children }: GlobalErrorHandlerProps) {
  const [isChunkReloading, setIsChunkReloading] = useState(false)
  const [chunkGiveUp, setChunkGiveUp] = useState(false)

  // Reset chunk-reload counter once the app successfully hydrates.
  // Without this the counter accumulates and users get stuck on the "give up" screen
  // even though the app loaded fine on subsequent visits.
  useEffect(() => {
    clearChunkLoadRecoveryCounter()
  }, [])

  // Handle ChunkLoadErrors: auto-reload silently instead of crashing the UI
  const handleChunkLoadError = useCallback((error: Error) => {
    console.warn('⚡ [GLOBAL-ERROR-HANDLER] ChunkLoadError detected — attempting recovery', error.message)
    const outcome = prepareChunkLoadRecovery()
    if (outcome === 'reload') {
      setIsChunkReloading(true)
      // ChunkLoadErrorHandler component handles the actual reload via its own useEffect
    } else {
      // Max retries exhausted — show manual reload card
      setChunkGiveUp(true)
    }
  }, [])

  // Report errors to tracking service (if available).
  // Used for background async errors that should NOT show UI — only log/report.
  const reportError = useCallback((error: Error, context: string) => {
    console.error('📊 [ERROR-REPORTING]', {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    })

    // Send to error tracking service (e.g., Sentry, LogRocket, etc.)
    if (typeof window !== 'undefined' && (window as any).reportError) {
      (window as any).reportError(error, context)
    }

    // TODO: [SonuRamTODO] Integrate with error tracking service
    // Example: Sentry.captureException(error, { extra: { context } })
  }, [])

  // Set up global error handlers.
  // onError is intentionally NOT passed: background async errors must not replace the UI.
  // ChunkLoadErrors are routed to handleChunkLoadError; everything else is logged only.
  useGlobalErrorHandler({
    onChunkLoadError: handleChunkLoadError,
    logErrors: true,
    reportError,
  })

  // ChunkLoadError in auto-reload state: show "Refreshing..." overlay
  if (isChunkReloading) {
    return <ChunkLoadErrorHandler giveUp={false} />
  }

  // ChunkLoadError gave up (max retries): show "App Update Required" card
  if (chunkGiveUp) {
    return <ChunkLoadErrorHandler giveUp={true} />
  }

  return <>{children}</>
}
