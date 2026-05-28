/**
 * @file error-boundary.tsx
 * @module components
 * @description Error Boundary Component - Catches and handles React component errors gracefully.
 *
 *   When `autoRecover` is enabled (dashboard), this boundary escalates silently:
 *     1. SILENT_RETRY_MAX silent resets (user sees loading spinner only).
 *     2. HARD_RELOAD_MAX total attempts → full `window.location.reload()`.
 *     3. Only after all attempts are exhausted do we show the TradingErrorDisplay card.
 *   This keeps transient render errors (stale SWR cache, provider race, hydration mismatch)
 *   from ever surfacing the red "Application Error" screen to trading users.
 * @author StockTrade
 * @created 2024-12-19
 * @updated 2026-04-24
 */

"use client"

import React, { Component, ReactNode } from 'react'
import { TradingErrorDisplay } from '@/components/trading/TradingErrorDisplay'
import { DashboardAutoRecoverOverlay } from '@/components/trading/DashboardAutoRecoverOverlay'
import {
  prepareDashboardErrorRecovery,
  type DashboardErrorRecoveryAction,
} from '@/lib/navigation/dashboard-error-recovery'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  /**
   * Whether to show technical details (default: false in production)
   */
  showTechnicalDetails?: boolean
  /**
   * When true, the boundary auto-retries silently before ever showing the error card.
   * Use on the trading dashboard so transient crashes surface as a loading spinner,
   * not a red error screen.
   */
  autoRecover?: boolean
}

type RecoveryPhase = "silent_retry" | "hard_reload" | "give_up"

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  recoveryPhase: RecoveryPhase | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryPhase: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ [ERROR-BOUNDARY] Caught error:', error)
    console.error('❌ [ERROR-BOUNDARY] Error info:', errorInfo)

    let recoveryPhase: RecoveryPhase | null = null
    if (this.props.autoRecover) {
      const action: DashboardErrorRecoveryAction = prepareDashboardErrorRecovery()
      recoveryPhase = action
    }

    this.setState({
      error,
      errorInfo,
      recoveryPhase,
    })

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Log to monitoring service (if available)
    if (typeof window !== 'undefined' && (window as any).logError) {
      (window as any).logError(error, errorInfo)
    }

    // Report to error tracking service (if available)
    if (typeof window !== 'undefined' && (window as any).reportError) {
      (window as any).reportError(error, `React Error Boundary: ${errorInfo.componentStack}`)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryPhase: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Auto-recovery: silent reset (user only sees the loading spinner).
      if (this.state.recoveryPhase === "silent_retry") {
        return (
          <DashboardAutoRecoverOverlay
            mode="silent_retry"
            onSilentRetry={this.handleReset}
          />
        )
      }

      // Auto-recovery: hard reload (user still only sees the loading spinner).
      if (this.state.recoveryPhase === "hard_reload") {
        return <DashboardAutoRecoverOverlay mode="hard_reload" />
      }

      // `getDerivedStateFromError` runs synchronously; `componentDidCatch` (which decides
      // the recoveryPhase) runs later. Bridge the gap with a loading placeholder so the
      // red error card never flashes between those two renders.
      if (this.props.autoRecover && this.state.recoveryPhase === null) {
        return <DashboardAutoRecoverOverlay mode="silent_retry" />
      }

      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Last resort: show the professional TradingErrorDisplay component.
      return (
        <TradingErrorDisplay
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleReset}
          showTechnicalDetails={this.props.showTechnicalDetails}
        />
      )
    }

    return this.props.children
  }
}

/**
 * HOC to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}
