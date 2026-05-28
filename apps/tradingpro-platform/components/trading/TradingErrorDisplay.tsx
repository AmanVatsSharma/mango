/**
 * @file TradingErrorDisplay.tsx
 * @module trading
 * @description Professional error display component for trading clients with user-friendly messaging and recovery options
 * @author StockTrade
 * @created 2024-12-19
 */

"use client"
 
import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  MessageCircle, 
  ChevronDown, 
  ChevronUp,
  TrendingUp,
  Shield
} from "lucide-react"
import { useRouter } from "next/navigation"
import { BRAND_IDENTITY, mailtoSupport } from "@/Branding"
import { getAppRoute } from "@/lib/branding-routes"

interface TradingErrorDisplayProps {
  /**
   * The error object that occurred
   */
  error: Error | null
  
  /**
   * Optional error info from React error boundary
   */
  errorInfo?: React.ErrorInfo | null
  
  /**
   * Callback to retry/reset the error state
   */
  onRetry?: () => void
  
  /**
   * Optional custom error message to display
   */
  customMessage?: string
  
  /**
   * Whether to show technical details (default: false in production)
   */
  showTechnicalDetails?: boolean
}

/**
 * TradingErrorDisplay Component
 * 
 * Displays professional, user-friendly error messages for trading clients.
 * Provides clear recovery options and maintains a professional trading platform aesthetic.
 * 
 * Features:
 * - Clear, non-technical error messaging
 * - Multiple recovery options (Retry, Go Home, Contact Support)
 * - Collapsible technical details for debugging
 * - Trading-focused visual design
 * - Responsive layout
 */
export function TradingErrorDisplay({
  error,
  errorInfo,
  onRetry,
  customMessage,
  showTechnicalDetails = process.env.NODE_ENV === 'development'
}: TradingErrorDisplayProps) {
  const router = useRouter()
  const [showDetails, setShowDetails] = useState(false)

  // Determine error type and user-friendly message
  const getErrorMessage = (): { title: string; description: string; severity: 'low' | 'medium' | 'high' } => {
    if (customMessage) {
      return {
        title: "Application Error",
        description: customMessage,
        severity: 'medium'
      }
    }

    if (!error) {
      return {
        title: "Something Went Wrong",
        description: "An unexpected error occurred. Your trading data is safe and secure.",
        severity: 'medium'
      }
    }

    const errorMessage = error.message.toLowerCase()

    // Chunk / deployment update errors — must be checked before network (overlap with 'fetch')
    if (
      error.name === 'ChunkLoadError' ||
      errorMessage.includes('chunk') ||
      errorMessage.includes('dynamically imported')
    ) {
      return {
        title: 'App Update Available',
        description: 'The app was updated. Please refresh the page to load the latest version. Your trading data is safe.',
        severity: 'low'
      }
    }

    // Hydration mismatch — React 18 throws when server HTML doesn't match client render
    if (
      errorMessage.includes('hydration') ||
      errorMessage.includes('did not match') ||
      errorMessage.includes('server-rendered html') ||
      errorMessage.includes('initial ui does not match')
    ) {
      return {
        title: 'App Update Available',
        description: 'The app was updated while you were active. Please refresh the page to reload the latest version.',
        severity: 'low'
      }
    }

    // Network/Connection errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
      return {
        title: "Connection Issue",
        description: "Unable to connect to our trading servers. Please check your internet connection and try again. Your orders and positions are safe.",
        severity: 'high'
      }
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return {
        title: "Request Timeout",
        description: "The request took too long to complete. This may be due to high market activity. Please try again.",
        severity: 'medium'
      }
    }

    // Authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      return {
        title: "Session Expired",
        description: "Your session has expired. Please log in again to continue trading.",
        severity: 'high'
      }
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('forbidden') || errorMessage.includes('403')) {
      return {
        title: "Access Denied",
        description: "You don't have permission to perform this action. Please contact support if you believe this is an error.",
        severity: 'medium'
      }
    }

    // Server errors
    if (errorMessage.includes('500') || errorMessage.includes('server error') || errorMessage.includes('internal')) {
      return {
        title: "Server Error",
        description: "We're experiencing technical difficulties. Our team has been notified. Your trading data is secure.",
        severity: 'high'
      }
    }

    // Generic error
    return {
      title: "Application Error",
      description: "An unexpected error occurred while processing your request. Your trading data and positions are safe. Please try again or contact support if the issue persists.",
      severity: 'medium'
    }
  }

  const { title, description, severity } = getErrorMessage()

  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      window.location.reload()
    }
  }

  const handleGoHome = () => {
    router.push(getAppRoute("dashboard"))
  }

  const handleContactSupport = () => {
    // Open support email or support page
    window.location.href = mailtoSupport("Application Error Report", `Error Details:\n${error?.message || "Unknown error"}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <Card className="w-full max-w-lg border-2 shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-4">
          {/* Error Icon with Animation */}
          <div className="flex justify-center mb-2">
            <div className={`relative p-4 rounded-full ${
              severity === 'high' 
                ? 'bg-destructive/20 animate-pulse' 
                : severity === 'medium'
                ? 'bg-yellow-500/20'
                : 'bg-blue-500/20'
            }`}>
              <AlertTriangle className={`w-12 h-12 ${
                severity === 'high' 
                  ? 'text-destructive' 
                  : severity === 'medium'
                  ? 'text-yellow-600'
                  : 'text-blue-600'
              }`} />
              {/* Shield overlay for security assurance */}
              <div className="absolute -bottom-1 -right-1 bg-background border-2 border-green-500 rounded-full p-1">
                <Shield className="w-4 h-4 text-green-600" />
              </div>
            </div>
          </div>

          {/* Trading Brand Icon */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
              <TrendingUp className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-muted-foreground">{BRAND_IDENTITY.names.full}</span>
          </div>

          <CardTitle className="text-2xl font-bold text-foreground">
            {title}
          </CardTitle>
          
          <CardDescription className="text-base leading-relaxed px-2">
            {description}
          </CardDescription>

          {/* Security Assurance Banner */}
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">Your trading data, orders, and positions are secure and unaffected.</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleRetry}
              className="w-full h-11 text-base font-semibold shadow-md hover:shadow-lg transition-all"
              size="lg"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Retry Operation
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={handleGoHome}
                variant="outline"
                className="w-full h-10"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
              
              <Button 
                onClick={handleContactSupport}
                variant="outline"
                className="w-full h-10"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Contact Support
              </Button>
            </div>
          </div>

          {/* Technical Details (Collapsible) */}
          {showTechnicalDetails && error && (
            <div className="mt-6 pt-4 border-t border-border">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="font-medium">Technical Details</span>
                {showDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-3">
                  {error.message && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Error Message:</p>
                      <p className="text-sm font-mono text-foreground break-all">{error.message}</p>
                    </div>
                  )}

                  {error.stack && (
                    <div className="p-3 bg-muted rounded-md max-h-40 overflow-auto">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Stack Trace:</p>
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  )}

                  {errorInfo?.componentStack && (
                    <div className="p-3 bg-muted rounded-md max-h-40 overflow-auto">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Component Stack:</p>
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}

                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Error ID:</p>
                    <p className="text-xs font-mono text-foreground">
                      {error.name || 'Unknown'} - {new Date().toISOString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Help Text */}
          <p className="text-xs text-center text-muted-foreground pt-2">
            If this problem persists, please contact our support team with the error details above.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
