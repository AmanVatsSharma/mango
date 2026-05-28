"use client"

/**
 * @file console-error-boundary.tsx
 * @module components/console
 * @description Route-level error boundary for console pages with user recovery actions.
 * @author StockTrade
 * @created 2026-02-16
 */

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getMarketingRoute } from '@/lib/branding-routes'

interface ConsoleErrorBoundaryProps {
  children: React.ReactNode
}

interface ConsoleErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ConsoleErrorBoundary extends React.Component<
  ConsoleErrorBoundaryProps,
  ConsoleErrorBoundaryState
> {
  constructor(props: ConsoleErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ConsoleErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Console Error Boundary caught error:', error, errorInfo)
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return <ConsoleErrorFallback error={this.state.error} onReset={this.handleReset} />
    }

    return this.props.children
  }
}

interface ConsoleErrorFallbackProps {
  error: Error | null
  onReset: () => void
}

function ConsoleErrorFallback({ error, onReset }: ConsoleErrorFallbackProps) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-center min-h-[100dvh] p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg"
      >
        <Card className="border-destructive">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-destructive/10 rounded-full">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-xl">Something went wrong</CardTitle>
            <CardDescription>
              We encountered an error while loading your console. Don't worry, your data is safe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 bg-muted rounded-md text-sm">
                <p className="font-mono text-xs break-all">{error.message}</p>
              </div>
            )}
            
            <div className="flex flex-col gap-2">
              <Button onClick={onReset} className="w-full" variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button onClick={() => router.push(getMarketingRoute("home"))} variant="outline" className="w-full">
                <Home className="w-4 h-4 mr-2" />
                Go to Home
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              If this problem persists, please contact support
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

// Export motion for framer-motion
import { motion } from 'framer-motion'
