"use client"

/**
 * @file console-loading-state.tsx
 * @module components/console
 * @description Loading skeleton and full-page loading states for console surfaces.
 * @author StockTrade
 * @created 2026-02-16
 */

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function ConsoleLoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh] p-4 bg-gradient-to-b from-background via-background to-muted/20">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-4 w-full max-w-6xl"
      >
        <div className="flex justify-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Loading your console...</h3>
          <p className="text-sm text-muted-foreground">
            Fetching your account data and trading information
          </p>
        </div>
        
        {/* Skeleton cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-8 mx-auto max-w-5xl">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-8 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

export function ConsoleLoadingSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
      </div>
      
      {/* Grid of cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-8 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
