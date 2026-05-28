/**
 * @file use-pagination.ts
 * @module hooks/admin
 * @description Enhanced pagination hook combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { normalizePaginationPageToken } from "@/hooks/admin/pagination-number-utils"

interface UsePaginationOptions {
  initialPage?: number
  totalPages?: number
  syncWithURL?: boolean
  basePath?: string
  pageParamName?: string
}

interface UsePaginationResult {
  page: number
  setPage: (page: number) => void
  totalPages: number
  goToNext: () => void
  goToPrev: () => void
  goToFirst: () => void
  goToLast: () => void
  canGoNext: boolean
  canGoPrev: boolean
}

/**
 * Enhanced Pagination Hook
 * 
 * Combines pagination patterns from:
 * - user-management.tsx (page state, totalPages)
 * - orders-management.tsx (page from URL, useMemo params)
 * - positions-management.tsx (page from URL, useMemo params)
 * - trade-management.tsx (page from URL, useMemo params)
 * - audit-trail.tsx (page state, totalPages)
 * - financial-overview.tsx (page state, totalPages calculation)
 * 
 * Features:
 * - Page state management
 * - URL sync support
 * - Navigation helpers
 * - Total pages calculation
 * - Validation
 */
export function usePagination({
  initialPage = 1,
  totalPages: initialTotalPages = 1,
  syncWithURL = false,
  basePath = "",
  pageParamName = "page"
}: UsePaginationOptions): UsePaginationResult {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [page, setPageState] = useState<number>(() => {
    if (syncWithURL) {
      const urlPage = searchParams.get(pageParamName)
      return normalizePaginationPageToken(urlPage, initialPage)
    }
    return initialPage
  })

  const [totalPages, setTotalPages] = useState(initialTotalPages)

  const setPage = useCallback((newPage: number) => {
    const validatedPage = Math.max(1, Math.min(totalPages, newPage))
    setPageState(validatedPage)

    if (syncWithURL && basePath) {
      const params = new URLSearchParams(searchParams.toString())
      params.set(pageParamName, String(validatedPage))
      router.replace(`${basePath}&${params.toString()}`)
    }
  }, [totalPages, syncWithURL, basePath, pageParamName, searchParams, router])

  const goToNext = useCallback(() => {
    setPage(page + 1)
  }, [page, setPage])

  const goToPrev = useCallback(() => {
    setPage(page - 1)
  }, [page, setPage])

  const goToFirst = useCallback(() => {
    setPage(1)
  }, [setPage])

  const goToLast = useCallback(() => {
    setPage(totalPages)
  }, [totalPages, setPage])

  const canGoNext = useMemo(() => page < totalPages, [page, totalPages])
  const canGoPrev = useMemo(() => page > 1, [page])

  // Sync from URL on mount if enabled
  useEffect(() => {
    if (syncWithURL) {
      const urlPage = searchParams.get(pageParamName)
      if (urlPage) {
        const parsedPage = normalizePaginationPageToken(urlPage, page)
        if (parsedPage !== page) {
          setPageState(parsedPage)
        }
      }
    }
  }, [syncWithURL, pageParamName, searchParams])

  return {
    page,
    setPage,
    totalPages,
    goToNext,
    goToPrev,
    goToFirst,
    goToLast,
    canGoNext,
    canGoPrev
  }
}
