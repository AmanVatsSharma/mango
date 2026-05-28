/**
 * @file use-url-filters.ts
 * @module hooks/admin
 * @description Enhanced URL filter sync hook combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

interface UseURLFiltersOptions {
  basePath?: string
  filters: Record<string, string | number | boolean>
  syncOnMount?: boolean
}

interface UseURLFiltersResult {
  filters: Record<string, string>
  setFilter: (key: string, value: string | number | boolean) => void
  resetFilters: () => void
  queryString: string
  updateURL: () => void
}

/**
 * Enhanced URL Filters Hook
 * 
 * Combines URL sync patterns from:
 * - orders-management.tsx (useMemo params, useEffect router.replace)
 * - positions-management.tsx (useMemo params, useEffect router.replace)
 * - trade-management.tsx (useMemo params, useEffect router.replace)
 * - financial-overview.tsx (buildQueryParams, useEffect)
 * 
 * Features:
 * - URL parameter sync
 * - Browser history support
 * - Query string building
 * - Filter state management
 * - Reset functionality
 */
export function useURLFilters({
  basePath = "",
  filters: initialFilters,
  syncOnMount = true
}: UseURLFiltersOptions): UseURLFiltersResult {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [filters, setFiltersState] = useState<Record<string, string>>(() => {
    // Initialize from URL if syncOnMount
    if (syncOnMount) {
      const urlFilters: Record<string, string> = {}
      Object.keys(initialFilters).forEach(key => {
        const urlValue = searchParams.get(key)
        if (urlValue !== null) {
          urlFilters[key] = urlValue
        } else {
          urlFilters[key] = String(initialFilters[key] || '')
        }
      })
      return urlFilters
    }
    // Initialize from initialFilters
    return Object.fromEntries(
      Object.entries(initialFilters).map(([k, v]) => [k, String(v || '')])
    )
  })

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all' && value !== '') {
        params.set(key, String(value))
      }
    })
    return params.toString()
  }, [filters])

  const setFilter = useCallback((key: string, value: string | number | boolean) => {
    setFiltersState(prev => ({
      ...prev,
      [key]: String(value)
    }))
  }, [])

  const resetFilters = useCallback(() => {
    const reset: Record<string, string> = {}
    Object.keys(initialFilters).forEach(key => {
      reset[key] = String(initialFilters[key] || '')
    })
    setFiltersState(reset)
  }, [initialFilters])

  const updateURL = useCallback(() => {
    if (basePath) {
      const url = queryString ? `${basePath}&${queryString}` : basePath
      router.replace(url)
    }
  }, [basePath, queryString, router])

  // Sync URL when filters change
  useEffect(() => {
    if (basePath) {
      updateURL()
    }
  }, [queryString, basePath, updateURL])

  return {
    filters,
    setFilter,
    resetFilters,
    queryString,
    updateURL
  }
}
