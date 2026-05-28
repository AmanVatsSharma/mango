/**
 * @file refresh-button.tsx
 * @module admin-console/shared
 * @description Enhanced refresh button component combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

interface RefreshButtonProps {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
  size?: "sm" | "default" | "lg" | "icon"
  showLabel?: boolean
}

/**
 * Enhanced Refresh Button Component
 * 
 * Combines refresh button patterns from all admin console components:
 * - Consistent styling
 * - Loading state with spinner
 * - Responsive label (hidden on mobile)
 * - Standardized appearance
 */
export function RefreshButton({ 
  onClick, 
  loading = false, 
  disabled = false, 
  className = "",
  size = "sm",
  showLabel = true
}: RefreshButtonProps) {
  return (
    <Button
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled || loading}
      className={`border-primary/50 text-primary hover:bg-primary/10 bg-transparent text-xs sm:text-sm ${className}`}
    >
      <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
      {showLabel && <span className="hidden sm:inline">Refresh</span>}
    </Button>
  )
}
