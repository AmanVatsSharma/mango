/**
 * @file use-global-error-handler.ts
 * @module hooks
 * @description Global error handler hook for catching unhandled errors and promise rejections
 * @author StockTrade
 * @created 2024-12-19
 */

"use client"

import { useEffect } from 'react'
import { isChunkLoadError } from '@/lib/navigation/chunk-load-recovery'

interface ErrorHandlerOptions {
  /**
   * Callback when an error is caught
   */
  onError?: (error: Error, errorInfo?: string) => void

  /**
   * Whether to log errors to console
   */
  logErrors?: boolean

  /**
   * Custom error reporting function
   */
  reportError?: (error: Error, context: string) => void

  /**
   * Callback invoked exclusively for ChunkLoadErrors (stale chunk after deployment).
   * When provided, ChunkLoadErrors are routed here and NOT sent to onError or reportError
   * because they are infrastructure noise, not application bugs.
   */
  onChunkLoadError?: (error: Error) => void
}

/**
 * useGlobalErrorHandler Hook
 * 
 * Sets up global error handlers for:
 * - window.onerror (synchronous errors)
 * - unhandledrejection (unhandled promise rejections)
 * 
 * This ensures all client-side errors are caught and can be displayed
 * to users in a professional manner.
 * 
 * @param options Configuration options for error handling
 * 
 * @example
 * ```tsx
 * useGlobalErrorHandler({
 *   onError: (error) => {
 *     // Show error UI
 *     setError(error)
 *   },
 *   reportError: (error, context) => {
 *     // Send to error tracking service
 *     trackError(error, context)
 *   }
 * })
 * ```
 */
export function useGlobalErrorHandler(options: ErrorHandlerOptions = {}) {
  const { onError, onChunkLoadError, logErrors = true, reportError } = options

  useEffect(() => {
    // Handle synchronous errors
    const handleError = (event: ErrorEvent) => {
      const error = event.error || new Error(event.message || 'Unknown error')

      // ChunkLoadErrors are infrastructure events (stale chunk after deploy), not bugs.
      // Route them to their dedicated handler and skip logging/reporting.
      if (isChunkLoadError(error) && onChunkLoadError) {
        onChunkLoadError(error)
        return
      }

      const errorInfo = `File: ${event.filename}, Line: ${event.lineno}, Col: ${event.colno}`

      if (logErrors) {
        console.error('🚨 [GLOBAL-ERROR-HANDLER] Caught error:', {
          error,
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          errorInfo
        })
      }

      // Report to error tracking service if provided
      if (reportError) {
        reportError(error, `Global Error: ${errorInfo}`)
      }

      // Call custom error handler
      if (onError) {
        onError(error, errorInfo)
      }

      // Prevent default browser error handling if we're handling it
      // event.preventDefault()
    }

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason || 'Unhandled promise rejection'))

      // ChunkLoadErrors from dynamic imports arrive as unhandled rejections.
      // Route them to their dedicated handler and skip logging/reporting.
      if (isChunkLoadError(error) && onChunkLoadError) {
        onChunkLoadError(error)
        return
      }

      if (logErrors) {
        console.error('🚨 [GLOBAL-ERROR-HANDLER] Unhandled promise rejection:', {
          error,
          reason: event.reason
        })
      }

      // Report to error tracking service if provided
      if (reportError) {
        reportError(error, 'Unhandled Promise Rejection')
      }

      // Call custom error handler
      if (onError) {
        onError(error, 'Unhandled Promise Rejection')
      }

      // Prevent default browser error handling
      // event.preventDefault()
    }

    // Register global error handlers
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // Cleanup
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [onError, onChunkLoadError, logErrors, reportError])
}
