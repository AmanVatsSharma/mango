"use client"

/**
 * @file console-error-state.tsx
 * @module components/console
 * @description Reusable console error state card with retry affordance and error categorization.
 * @author StockTrade
 * @created 2026-02-16
 */

import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, WifiOff, Database } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ConsoleErrorStateProps {
  error: string | null
  onRetry?: () => void
}

export function ConsoleErrorState({ error, onRetry }: ConsoleErrorStateProps) {
  // Determine error type and icon
  const getErrorInfo = () => {
    const errorStr = error?.toLowerCase() || ''
    
    if (errorStr.includes('network') || errorStr.includes('fetch')) {
      return {
        icon: WifiOff,
        title: 'Network Error',
        description: 'Unable to connect to the server. Please check your internet connection.',
        color: 'text-orange-500'
      }
    }
    
    if (errorStr.includes('unauthorized') || errorStr.includes('401')) {
      return {
        icon: AlertTriangle,
        title: 'Session Expired',
        description: 'Your session has expired. Please refresh the page to sign in again.',
        color: 'text-yellow-500'
      }
    }
    
    if (errorStr.includes('database') || errorStr.includes('500')) {
      return {
        icon: Database,
        title: 'Server Error',
        description: 'We\'re experiencing technical difficulties. Please try again in a moment.',
        color: 'text-red-500'
      }
    }
    
    return {
      icon: AlertTriangle,
      title: 'Error Loading Console',
      description: error || 'An unexpected error occurred. Please try again.',
      color: 'text-red-500'
    }
  }

  const errorInfo = getErrorInfo()
  const Icon = errorInfo.icon

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4 bg-gradient-to-b from-background via-background to-muted/20 rounded-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg"
      >
        <Card className="border-destructive/50">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <div className={`p-4 bg-destructive/10 rounded-full ${errorInfo.color}`}>
                <Icon className="w-8 h-8" />
              </div>
            </div>
            <CardTitle className="text-xl">{errorInfo.title}</CardTitle>
            <CardDescription className="text-base">
              {errorInfo.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Technical Details
                </summary>
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="font-mono text-xs break-all">{error}</p>
                </div>
              </details>
            )}
            
            {onRetry && (
              <Button onClick={onRetry} className="w-full" variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            
            <p className="text-xs text-center text-muted-foreground mt-4">
              If this problem persists, please contact support or try again later
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
