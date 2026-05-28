/**
 * @file pagination.tsx
 * @module admin-console/shared
 * @description Enhanced pagination component combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  loading?: boolean
  className?: string
  showPageInfo?: boolean
}

/**
 * Enhanced Pagination Component
 * 
 * Combines pagination patterns from:
 * - user-management.tsx
 * - orders-management.tsx
 * - positions-management.tsx
 * - trade-management.tsx
 * - audit-trail.tsx
 * - financial-overview.tsx
 * 
 * Features:
 * - Consistent UI across all components
 * - Loading state support
 * - Page info display
 * - Responsive design
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  loading = false,
  className = "",
  showPageInfo = true
}: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className={`flex justify-center items-center gap-2 mt-4 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1 || loading}
        className="border-primary/50 text-primary hover:bg-primary/10"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline ml-1">Prev</span>
      </Button>
      
      {showPageInfo && (
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
      )}
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages || loading}
        className="border-primary/50 text-primary hover:bg-primary/10"
      >
        <span className="hidden sm:inline mr-1">Next</span>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  )
}
